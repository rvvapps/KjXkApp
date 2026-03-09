export function saveAs(blob, filename) {
  // iOS Safari no soporta <a download> con blob URLs.
  // Convertir a base64 data URL que sí funciona en iOS.
  const reader = new FileReader();
  reader.onload = function () {
    const dataUrl = reader.result;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  reader.readAsDataURL(blob);
}
