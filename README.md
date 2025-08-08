# Excel to JSON Converter

Bu proje, yüklenen Excel (XLSX) dosyalarını JSON formatına dönüştüren ve bu verileri kategorilere göre saklayan basit bir web uygulamasıdır. Ayrıca kullanıcıların form aracılığıyla manuel olarak veri eklemesine de olanak tanır.

## Özellikler

- **Excel'den JSON'a Dönüştürme:** XLSX formatındaki dosyaları yükleyerek verileri otomatik olarak JSON'a çevirir ve sunucuda saklar.
- **Kategori Bazlı Veri Saklama:** Yüklenen veriler, seçilen kategoriye göre ayrı JSON dosyalarında (`uploads/kategori_adi.json`) saklanır.
- **Form ile Manuel Veri Girişi:** Excel dosyası olmadan, kullanıcıların bir form doldurarak yeni veri girdileri oluşturmasına olanak tanır.
- **Veri Görüntüleme ve Arama:** Her kategori için özel bir sayfada verileri listeleyebilir, görüntüleyebilir ve arama kutusuyla veriler içinde filtreleme yapabilirsiniz.
- **Duyarlı Tasarım ve Tema Desteği:** Modern ve temiz bir arayüz sunar. Koyu ve açık tema desteği ile kullanıcı tercihine uyum sağlar.
- **Yinelenen Veri Kontrolü:** Mevcut verilere eklenen yeni verilerin mükerrer olup olmadığını kontrol eder ve yalnızca benzersiz verileri saklar.
- **Akıllı Başlık Algılama:** Excel dosyasındaki en yoğun hücrelere sahip satırı otomatik olarak başlık satırı olarak algılar.
- **404 Hata Sayfası:** Geçersiz URL'ler için özel tasarlanmış bir hata sayfası bulunur.

## Kullanılan Teknolojiler

- **Backend:** Node.js, Express.js.
- **Frontend:** HTML5, CSS3, JavaScript (Vanilla JS).
- **Bağımlılıklar:**
  - `express`: Web sunucusu oluşturmak için.
  - `multer`: Dosya yüklemeyi yönetmek için.
  - `xlsx`: Excel dosyalarını okuyup işlemek için.

## Kurulum ve Çalıştırma

Bu projeyi yerel makinenizde çalıştırmak için aşağıdaki adımları izleyin.

### Ön Gereksinimler

- [Node.js](https://nodejs.org/en/) kurulu olmalıdır.

### Adımlar

1.  **Depoyu Klonlayın:**

    ```bash
    git clone [https://github.com/kullanici-adi/proje-adi.git](https://github.com/kullanici-adi/proje-adi.git)
    cd proje-adi
    ```

2.  **Gerekli Paketleri Yükleyin:**

    ```bash
    npm install
    ```

    _Not: Tüm bağımlılıklar (express, multer, xlsx) `npm install` ile kurulur, `package.json` dosyasında tanımlı olduğunu varsayıyorum._

3.  **Sunucuyu Başlatın:**

    ```bash
    node server.js
    ```

4.  **Uygulamaya Erişin:**
    Tarayıcınızda `http://localhost:3000` adresine gidin.

## Proje Yapısı

```
excel-to-web
├── public/
│   ├── 404.css
│   ├── 404.html
│   ├── data.css
│   ├── data.html
│   ├── general.css
│   ├── index.css
│   └── index.html
├── uploads/
└── server.js
```

## API Uç Noktaları

- `POST /upload`: Excel dosyasını yükler, JSON'a dönüştürür ve saklar.
- `POST /api/add-data`: Form aracılığıyla gönderilen manuel verileri saklar.
- `POST /api/update-categories`: Dinamik olarak kategori linklerini oluşturmak için frontend'den gelen kategori listesini günceller.
- `GET /api/get-data/:category`: Belirtilen kategoriye ait tüm JSON verilerini döndürür.
- `GET /:category`: Kategoriye özel veri görüntüleme sayfasını sunar.
- `GET /`: Ana sayfayı sunar.

## Lisans

Bu proje MIT Lisansı ile lisanslanmıştır. Daha fazla bilgi için `LICENSE` dosyasına bakınız.
