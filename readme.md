-----

## Proje Açıklaması

Bu proje, Hugging Face ekosisteminde popüler olan **Unsloth** kütüphanesini kullanarak büyük dil modellerinin (LLM) hızlı ve verimli bir şekilde fine-tuning (ince ayar) işlemini nasıl yapacağınızı gösteren bir rehberdir. Amacımız, kendi veri setinizle modelin yeteneklerini geliştirerek özel bir yapay zeka asistanı oluşturmaktır.

Bu README dosyası, kodun her bölümünü açıklayarak süreci kolayca takip etmenizi sağlamak için tasarlanmıştır.

-----

### 1\. Ortam Kurulumu ve Kütüphane Yükleme

Bu bölümde, projeyi çalıştırabilmek için gerekli olan kütüphaneler kurulur. Özellikle Google Colab ortamında çalışıyorsanız, Unsloth kütüphanesinin optimizasyonlarından faydalanabilmek için özel bir kurulum süreci uygulanır.

```python
import os
if "COLAB_" not in "".join(os.environ.keys()):
!pip install unsloth
else:
# Do this only in Colab notebooks! Otherwise use pip install unsloth
!pip install --no-deps bitsandbytes accelerate xformers==0.0.29.post3 peft trl triton cut_cross_entropy unsloth_zoo
!pip install sentencepiece protobuf "datasets>=3.4.1,<4.0.0" "huggingface_hub>=0.34.0" hf_transfer
!pip install --no-deps unsloth
```

-----

### 2\. Model ve Tokenizer Yükleme

Burada, `unsloth` kütüphanesinin sunduğu `FastLanguageModel` sınıfı kullanılarak bir dil modeli ve onunla uyumlu tokenizer (metin parçalayıcı) yüklenir. **4-bit kuantizasyon** ile modelin bellek kullanımı ciddi oranda düşürülür.

```python
from unsloth import FastLanguageModel
import torch
fourbit_models = [
"unsloth/Qwen3-1.7B-unsloth-bnb-4bit", # Qwen 14B 2x faster
"unsloth/Qwen3-4B-unsloth-bnb-4bit",
"unsloth/Qwen3-8B-unsloth-bnb-4bit",
"unsloth/Qwen3-14B-unsloth-bnb-4bit",
"unsloth/Qwen3-32B-unsloth-bnb-4bit",

# 4bit dynamic quants for superior accuracy and low memory use
"unsloth/gemma-3-12b-it-unsloth-bnb-4bit",
"unsloth/Phi-4",
"unsloth/Llama-3.1-8B",
"unsloth/Llama-3.2-3B",
"unsloth/orpheus-3b-0.1-ft-unsloth-bnb-4bit" # [NEW] We support TTS models!
] # More models at https://huggingface.co/unsloth

model, tokenizer = FastLanguageModel.from_pretrained(
model_name = "unsloth/DeepSeek-R1-0528-Qwen3-8B",
max_seq_length = 2048, # Context length - can be longer, but uses more memory
load_in_4bit = True, # 4bit uses much less memory
load_in_8bit = False, # A bit more accurate, uses 2x memory
full_finetuning = False, # We have full finetuning now!
# token = "hf_...", # use one if using gated models
)
```

-----

### 3\. Modeli Fine-tuning (İnce Ayar) için Hazırlama

Modeli daha verimli bir şekilde eğitmek için **PEFT (Parameter-Efficient Fine-Tuning)** yöntemlerinden biri olan **LoRA** (Low-Rank Adaptation) kullanılır. `get_peft_model` fonksiyonu ile modelin sadece belirli katmanları eğitilmek üzere ayarlanır.

```python
model = FastLanguageModel.get_peft_model(
model,
r = 32, # Choose any number > 0! Suggested 8, 16, 32, 64, 128
target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
"gate_proj", "up_proj", "down_proj",],
lora_alpha = 32, # Best to choose alpha = rank or rank*2
lora_dropout = 0, # Supports any, but = 0 is optimized
bias = "none", # Supports any, but = "none" is optimized
# [NEW] "unsloth" uses 30% less VRAM, fits 2x larger batch sizes!
use_gradient_checkpointing = "unsloth", # True or "unsloth" for very long context
random_state = 3407,
use_rslora = False, # We support rank stabilized LoRA
loftq_config = None, # And LoftQ
)
```

-----

### 4\. Veri Seti Hazırlığı

Özel veri setinizi (bu örnekte `Tensoic/FrontendCookbook`) yükleyerek modelin beklediği sohbet formatına dönüştürürsünüz. `convert_to_conversation` fonksiyonu, her bir soru-cevap çiftini modelin anlayacağı bir metin formatına getirir.

```python
from datasets import load_dataset, Dataset

# Kendi veri kümenizi yüklüyorsunuz
ds = load_dataset("Tensoic/FrontendCookbook")

# Veri kümenizi, modelin beklediği konuşma formatına DÜZGÜNCE dönüştürüyoruz
def convert_to_conversation(sample):
# Modelin sohbet formatı için bir mesaj listesi oluşturun
conversation = [
{"role": "user", "content": sample["question"]},
{"role": "assistant", "content": sample["answer"]},
]
# Tokenizer'ın sohbet şablonunu uygulayarak METNE dönüştürün
formatted_text = tokenizer.apply_chat_template(
conversation,
tokenize=False,
add_generation_prompt=False
)
# Veri setine "text" adında yeni bir sütun ekleyerek metni döndürün
return {"text": formatted_text}
pass

# convert_to_conversation fonksiyonunu verisetinizin 'train' split'ine uygulayın.
converted_dataset = ds["train"].map(convert_to_conversation)
```

-----

### 5\. Eğitici (Trainer) Yapılandırma ve Eğitim

`SFTTrainer` (Supervised Fine-Tuning Trainer) kullanılarak eğitim süreci başlatılır. Bu adımda, batch size, öğrenme oranı gibi hiperparametreler ayarlanır ve modelin eğitimi gerçekleştirilir.

```python
from trl import SFTTrainer, SFTConfig

trainer = SFTTrainer(
model = model,
tokenizer = tokenizer,
train_dataset = converted_dataset,
eval_dataset = None, # İsteğe bağlı olarak bir değerlendirme veri seti ekleyebilirsiniz.
args = SFTConfig(
dataset_text_field = "text", # Önemli: Düzeltilmiş fonksiyondan gelen "text" sütununu kullanın
per_device_train_batch_size = 2,
gradient_accumulation_steps = 4,
warmup_steps = 5,
max_steps = 30,
learning_rate = 2e-4,
logging_steps = 1,
optim = "adamw_8bit",
weight_decay = 0.01,
lr_scheduler_type = "linear",
seed = 3407,
report_to = "none",
),
)
```

```python
# @title Show current memory stats
gpu_stats = torch.cuda.get_device_properties(0)
start_gpu_memory = round(torch.cuda.max_memory_reserved() / 1024 / 1024 / 1024, 3)
max_memory = round(gpu_stats.total_memory / 1024 / 1024 / 1024, 3)
print(f"GPU = {gpu_stats.name}. Max memory = {max_memory} GB.")
print(f"{start_gpu_memory} GB of memory reserved.")
```

```python
trainer_stats = trainer.train()
```

-----

### 6\. Eğitim Sonrası Model Kullanımı

Eğitim tamamlandıktan sonra, eğitilmiş modeli kullanarak yeni sorulara yanıtlar üretebilirsiniz. Bu bölümde, örnek bir soru (`"Select all elements with the 'role' attribute set to 'button'..."`) ile modelin nasıl cevap verdiğini görebilirsiniz.

```python
# Kendi veri kümenizden bir "question" örneği kullanın.
messages = [
{"role" : "user", "content" : "Select all elements with the 'role' attribute set to 'button' and add a 'disabled' attribute to them."}
]
text = tokenizer.apply_chat_template(
messages,
tokenize = False,
add_generation_prompt = True, # Üretim için gerekli
enable_thinking = False, # 'thinking' çıktısını devre dışı bırakır
)

from transformers import TextStreamer
_ = model.generate(
**tokenizer(text, return_tensors = "pt").to("cuda"),
max_new_tokens = 256, # Increase for longer outputs!
temperature = 0.7, top_p = 0.8, top_k = 20, # For non thinking
streamer = TextStreamer(tokenizer, skip_prompt = True),
)
```

-----

### 7\. Modeli Kaydetme

Eğitilmiş LoRA adaptörlerini yerel olarak kaydeder veya Hugging Face Hub'a yükleyebilirsiniz.

```python
model.save_pretrained("lora_model") # Local saving
tokenizer.save_pretrained("lora_model")
# model.push_to_hub("your_name/lora_model", token = "...") # Online saving
# tokenizer.push_to_hub("your_name/lora_model", token = "...") # Online saving
```

-----

### 8\. Kaydedilmiş Modeli Tekrar Yükleme

İsteğe bağlı olarak, kaydettiğiniz LoRA adaptörlerini tekrar yükleyerek kullanmaya devam edebilirsiniz.

```python
if False:
from unsloth import FastLanguageModel
model, tokenizer = FastLanguageModel.from_pretrained(
model_name = "lora_model", # YOUR MODEL YOU USED FOR TRAINING
max_seq_length = 2048,
load_in_4bit = True,
)
```

-----

### 9\. Farklı Formatlarda Modeli Birleştirme ve Kaydetme

Modeli 16-bit, 4-bit, veya sadece LoRA adaptörleri olarak kaydedebilir, ayrıca Hugging Face Hub'a yükleyebilirsiniz.

```python
# Merge to 16bit
if False:
model.save_pretrained_merged("model", tokenizer, save_method = "merged_16bit",)
if False: # Pushing to HF Hub
model.push_to_hub_merged("hf/model", tokenizer, save_method = "merged_16bit", token = "")

# Merge to 4bit
if False:
model.save_pretrained_merged("model", tokenizer, save_method = "merged_4bit",)
if False: # Pushing to HF Hub
model.push_to_hub_merged("hf/model", tokenizer, save_method = "merged_4bit", token = "")

# Just LoRA adapters
if True:
model.save_pretrained("model")
tokenizer.save_pretrained("model")
if False: # Pushing to HF Hub
model.push_to_hub("hf/model", token = "")
tokenizer.push_to_hub("hf/model", token = "")
```

-----

### 10\. Bellek Temizleme

Eğitim veya tahmin sürecinden sonra GPU ve sistem belleğini temizlemek, kaynakların serbest bırakılmasına yardımcı olur.

```python
import torch
import gc
import os

print("Python objeleri ve VRAM önbelleği temizleniyor...")
gc.collect() # Python'ın çöp toplama mekanizmasını çalıştırın
# VRAM önbelleğini temizleyin
if torch.cuda.is_available():
torch.cuda.empty_cache()
# Daha agresif sistem RAM'i temizliği için Linux komutları
print("Sistem RAM önbellekleri temizleniyor...")
try:
os.system("sudo sync")
os.system("sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'")
print("RAM önbellekleri temizlendi.")
except Exception as e:
print(f"Linux önbellek temizleme komutları çalıştırılamadı: {e}")
```

-----

### 11\. GGUF Formatında Kaydetme

Modeli, **GGUF** gibi farklı kuantizasyon metotlarıyla (örneğin Q4\_K\_M) kaydederek CPU üzerinde çalıştırılabilen versiyonlarını oluşturabilirsiniz.

```python
# Save to 8bit Q8_0
if False:
model.save_pretrained_gguf("model", tokenizer,)
# Remember to go to https://huggingface.co/settings/tokens for a token!
# And change hf to your username!
if False:
model.push_to_hub_gguf("hf/model", tokenizer, token = "")

# Save to 16bit GGUF
if False:
model.save_pretrained_gguf("model", tokenizer, quantization_method = "f16")
if False: # Pushing to HF Hub
model.push_to_hub_gguf("hf/model", tokenizer, quantization_method = "f16", token = "")

# Save to q4_k_m GGUF
if True:
model.save_pretrained_gguf("model", tokenizer, quantization_method = "q4_k_m")
if False: # Pushing to HF Hub
model.push_to_hub_gguf("hf/model", tokenizer, quantization_method = "q4_k_m", token = "")

# Save to multiple GGUF options - much faster if you want multiple!
if False:
model.push_to_hub_gguf(
"hf/model", # Change hf to your username!
tokenizer,
quantization_method = ["q4_k_m", "q8_0", "q5_k_m",],
token = "", # Get a token at https://huggingface.co/settings/tokens
)
```