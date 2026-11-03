export const BACKLINK_TYPES = {
  blog: 'Blog',
  konuk: 'Konuk Yazı',
  forum: 'Forum',
  profil: 'Profil',
  web2: 'Web 2.0',
  pbn: 'PBN',
  haber: 'Haber',
  sosyal: 'Sosyal Medya',
  dizin: 'Dizin',
  video: 'Video',
  diger: 'Diğer',
};

export const BACKLINK_STATUS = {
  yayinda: { label: 'Yayında', tone: 'green' },
  planlandi: { label: 'Planlandı', tone: 'amber' },
  kaldirildi: { label: 'Kaldırıldı', tone: 'gray' },
  reddedildi: { label: 'Reddedildi', tone: 'red' },
};

export const INDEX_STATUS = {
  indexli: { label: 'Indexli', tone: 'green' },
  beklemede: { label: 'Beklemede', tone: 'amber' },
  indexsiz: { label: 'Indexsiz', tone: 'red' },
  bilinmiyor: { label: 'Bilinmiyor', tone: 'gray' },
};

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'];

export const TASK_CATEGORIES = {
  icerik: { label: 'İçerik', tone: 'blue' },
  teknik: { label: 'Teknik', tone: 'purple' },
  backlink: { label: 'Backlink', tone: 'teal' },
  sosyal: { label: 'Sosyal', tone: 'amber' },
  rapor: { label: 'Rapor', tone: 'gray' },
  diger: { label: 'Diğer', tone: 'gray' },
};

export const TASK_PRIORITIES = {
  dusuk: { label: 'Düşük', tone: 'gray' },
  orta: { label: 'Orta', tone: 'amber' },
  yuksek: { label: 'Yüksek', tone: 'red' },
};

export const TASK_STATUS = {
  bekliyor: { label: 'Bekliyor', tone: 'gray' },
  devam: { label: 'Devam Ediyor', tone: 'blue' },
  tamam: { label: 'Tamamlandı', tone: 'green' },
};

export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const MONTHLY_BACKLINK_GOAL = 8;
