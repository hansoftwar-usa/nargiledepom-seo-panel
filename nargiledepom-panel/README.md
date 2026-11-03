# nargiledepom.com · SEO & Backlink Paneli

Mobil öncelikli, tek kullanıcı (yönetici) şifresiyle korunan bir SEO/backlink takip paneli.
Node.js ile yazılmıştır ve hiçbir npm bağımlılığı yoktur (Node.js ≥ 18 yeterlidir).

## Özellikler
- Backlink kayıtları (site, URL, tür, DR/DA, fiyat, durum, index durumu, tarih, not)
- Anahtar kelime sıralama geçmişi ve trend grafiği
- Görev takibi (durum, öncelik, kategori, tarih)
- Notlar / raporlar
- Dashboard: KPI kartları, backlink büyüme grafiği, tür dağılımı, sıralama trendi
- JSON + CSV dışa aktarma, JSON içe aktarma (merge/replace)
- Demo veri yükle/temizle
- PWA (telefona ana ekran kısayolu)
- Mobilde alt gezinme, masaüstünde yan menü

## Hızlı Başlangıç (yerel)
```bash
cd nargiledepom-panel
node server.js
```
Açılışta konsolda yerel ve ağ adresleri yazılır:
```
Yerel: http://localhost:3000
Ag:    http://192.168.x.x:3000  (telefondan aynı Wi-Fi ile)
```
Tarayıcıdan `http://localhost:3000` adresine gidin. İlk açılışta bir yönetici şifresi belirleyin.

> Windows'ta `npm` scriptleri PowerShell güvenlik politikası nedeniyle engellenebilir; `node` doğrudan kullanılması önerilir. Geliştirme için `node --watch server.js` çalışır.

## Ortam Değişkenleri
| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | Dinlenecek port |
| `HOST` | `0.0.0.0` | Dinlenecek arayüz |
| `SITE` | `nargiledepom.com` | Panelde gösterilen site adı |
| `ADMIN_PASSWORD` | _(yok)_ | Ayarlanırsa ilk kurulum atlanır; şifre env'den yönetilir |
| `DATA_DIR` | `./data` | `db.json` veritabanı dizini (kalıcı disk) |
| `TRUST_PROXY` | _(yok)_ | HTTPS proxy (Render/Railway/VPS) arkasındaysa `1` yapın |

## Telefondan Erişim
1. **Aynı Wi-Fi:** `http://<BILGISAYAR-IP>:3000` adresini telefonda açın (sunucu başlangıcında listelenir).
2. **Dişarıdan (ngrok):**
   ```bash
   C:\Users\ahmet\bin\ngrok.exe http 3000
   ```
   Üretilen HTTPS adresini kullanın; `TRUST_PROXY=1` ayarlayın.

## Veri ve Yedekleme
- Veriler `DATA_DIR/db.json` dosyasında saklanır (atomik yazma).
- Panel içinden **Ayarlar → Yedekleme** ile JSON/CSV indirin, JSON yedekten geri yükleyin (merge/replace).
- Üretim ortamında `DATA_DIR`'i kalıcı bir diske (volume) bağlayın; aksi halde yeniden başlatmada veri kaybolur.

## Güvenlik
- Tek yönetici şifresi (scrypt hash), 30 günlük HttpOnly oturum çerezi.
- Giriş hız sınırlaması (IP başına).
- CSRF: çapraz kaynak POST/PUT/DELETE engellenir.
- Güvenlik başlıkları (CSP, HSTS, X-Frame-Options vb.) gönderilir.
- `ADMIN_PASSWORD` ayarlıysa şifre panelden değiştirilemez; değiştirilecekse env güncellenip sunucu yeniden başlatılır.

## Docker
```bash
docker build -t nargiledepom-panel .
docker run -d --name nargiledepom-panel \
  -p 3000:3000 \
  -e ADMIN_PASSWORD='guclu-bir-sifre' \
  -v nargiledepom-data:/data \
  -e DATA_DIR=/data \
  nargiledepom-panel
```

## Render / Railway
- Build komutu: _(yok, Node built-in)_ veya `node server.js`
- Start komutu: `node server.js`
- Ortam: `ADMIN_PASSWORD`, `DATA_DIR=/data`, `TRUST_PROXY=1`
- Kalıcı disk: `/data` (Render'da "Persistent Disk" ekleyin)

## VPS (systemd)
```bash
ADMIN_PASSWORD='...' DATA_DIR=/var/lib/nargiledepom DATA_DIR=/var/lib/nargiledepom node server.js
```
`systemd` servisi ile arka planda çalıştırın; ters proxy (nginx/Caddy) arkasında `TRUST_PROXY=1` kullanın.

## Geliştirme Notları
- Bağımlılık yok; `npm install` gerekmez.
- `node --check server.js` ile sözdizimi kontrolü yapılabilir.
- Frontend ES modülleri (`public/js`) tarayıcıda çalışır.
- Test verileri `demo` işaretli kayıtlar olarak saklanır; "Demo veriyi temizle" ile kaldırılır.

## Lisans
Özel kullanım.
