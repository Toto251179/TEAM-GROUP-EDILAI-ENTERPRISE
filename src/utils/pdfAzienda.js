import { azienda } from "../config/azienda";

let logoDataUrlPromise;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function caricaLogoDataUrl() {
  if (!azienda.logoSrc) return "";

  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(azienda.logoSrc)
      .then((response) => {
        if (!response.ok) throw new Error("Logo non disponibile");
        return response.blob();
      })
      .then(blobToDataUrl);
  }

  return logoDataUrlPromise;
}

export async function disegnaIntestazioneAzienda(doc, y = 18) {
  try {
    const logoDataUrl = await caricaLogoDataUrl();
    if (logoDataUrl) {
      const props = doc.getImageProperties(logoDataUrl);
      const maxWidth = 52;
      const maxHeight = 24;
      const ratio = Math.min(maxWidth / props.width, maxHeight / props.height);
      const width = props.width * ratio;
      const height = props.height * ratio;
      doc.addImage(logoDataUrl, "JPEG", 14, y - height + 7, width, height);
    }
  } catch {
    doc.setFillColor(21, 101, 192);
    doc.roundedRect(14, y - 9, 16, 16, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(azienda.logoText, 19, y);
  }

  doc.setTextColor(0, 0, 0);
}
