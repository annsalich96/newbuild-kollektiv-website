# foto-angleichen.py EIN AUS  (Ann 2026-11-25: Speaker-Fotos sollen in Korn, Helligkeit, Kontrast und Farbe zusammenpassen)
# Korn auf ~0.95 (entrauschen bzw. feines Korn ergaenzen), Helligkeit/Kontrast/Saettigung je HALB Richtung Mittelwert.
# Braucht opencv-contrib-python-headless (pip3 install --user). Ausgabe immer unter NEUEM Dateinamen (Cloudflare-Cache 4 h).
import sys, cv2, numpy as np
ZIEL_KORN, ZIEL_HELL, ZIEL_KONTR, ZIEL_SAT = 0.95, 48.0, 27.0, 60.0
STAERKE = 0.5
rng = np.random.default_rng(7)

def messen(img):
    h, w = img.shape[:2]; k = 750 / w
    a = cv2.resize(img, (750, int(h * k)), interpolation=cv2.INTER_AREA)
    L = cv2.cvtColor(a, cv2.COLOR_BGR2LAB)[..., 0].astype(float)
    hp = L - cv2.GaussianBlur(L, (0, 0), 1.2)
    grad = cv2.GaussianBlur(np.abs(cv2.Laplacian(cv2.GaussianBlur(L, (0, 0), 2), cv2.CV_64F)), (0, 0), 3)
    ruhig = grad < np.percentile(grad, 40)
    return np.median(np.abs(hp[ruhig])) * 1.4826

img = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)
h, w = img.shape[:2]
korn0 = messen(img)

# 1) Zu viel Rauschen -> entrauschen
if korn0 > ZIEL_KORN * 1.3:
    stark = min(12, 3 + korn0 * 2.5)
    img = cv2.fastNlMeansDenoisingColored(img, None, stark, stark * 0.8, 7, 21)

# 2) Farbe/Ton in LAB: Helligkeit (Gamma), Kontrast, Saettigung je halb Richtung Ziel
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(float)
L = lab[..., 0] / 255.0
hell = L.mean() * 100; kontr = L.std() * 100
ziel_hell = hell + (ZIEL_HELL - hell) * STAERKE
gamma = np.log(max(1e-3, ziel_hell / 100)) / np.log(max(1e-3, hell / 100))
gamma = float(np.clip(gamma, 0.6, 1.6))
L = np.clip(L, 1e-4, 1) ** gamma
kontr_jetzt = L.std() * 100
ziel_kontr = kontr + (ZIEL_KONTR - kontr) * STAERKE
f = float(np.clip(ziel_kontr / max(1e-3, kontr_jetzt), 0.8, 1.35))
m = L.mean(); L = np.clip((L - m) * f + m, 0, 1)
lab[..., 0] = L * 255
sat = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 1].mean()
if sat > 8:  # echte Farbfotos (s/w-Fotos bleiben s/w)
    ziel_sat = sat + (ZIEL_SAT - sat) * STAERKE
    fs = float(np.clip(ziel_sat / sat, 0.55, 1.3))
    lab[..., 1] = (lab[..., 1] - 128) * fs + 128
    lab[..., 2] = (lab[..., 2] - 128) * fs + 128
img = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

# 3) Feines Helligkeits-Korn ergaenzen, bis das Ziel erreicht ist
korn1 = messen(img)
if korn1 < ZIEL_KORN * 0.9:
    basis = img.astype(float)
    sig = max(0.5, w / 750 * 0.55)  # Korngroesse passend zur Aufloesung
    raus = cv2.GaussianBlur(rng.standard_normal((h, w)), (0, 0), sig)
    raus /= raus.std()
    amp = 2.0
    for _ in range(5):
        test = np.clip(basis + (raus * amp)[..., None], 0, 255).astype(np.uint8)
        k = messen(test)
        amp *= np.sqrt(max(1e-3, ZIEL_KORN ** 2 - korn1 ** 2)) / max(1e-3, np.sqrt(max(1e-6, k ** 2 - korn1 ** 2)))
    img = np.clip(basis + (raus * amp)[..., None], 0, 255).astype(np.uint8)

cv2.imwrite(sys.argv[2], img, [cv2.IMWRITE_JPEG_QUALITY, 90])
lab2 = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[..., 0] / 2.55
print('Korn %.2f -> %.2f | Hell %.0f -> %.0f | Kontr %.0f -> %.0f | Saett %.0f -> %.0f' % (
    korn0, messen(img), hell, lab2.mean(), kontr, lab2.std(), sat, cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 1].mean()))
