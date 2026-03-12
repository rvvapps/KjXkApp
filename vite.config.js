import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Plugin: reemplaza __BUILD_VERSION__ en sw.js con la versión real + timestamp
// Esto garantiza que cada build genere un sw.js diferente → el browser detecta update
function syncSwVersion() {
  return {
    name: 'sync-sw-version',
    writeBundle() {
      // Leer Settings.jsx para obtener APP_VERSION (ej: "0.15.36")
      const settingsPath = './src/pages/Settings.jsx';
      let appVersion = '0.0.0';
      if (fs.existsSync(settingsPath)) {
        const match = fs.readFileSync(settingsPath, 'utf-8').match(/APP_VERSION\s*=\s*"([^"]+)"/);
        if (match) appVersion = match[1];
      }
      // Agregar timestamp para forzar diferencia en cada build
      const buildStamp = Date.now();
      const cacheVersion = `${appVersion}-${buildStamp}`;

      const swPath = path.resolve('./dist/sw.js');
      if (fs.existsSync(swPath)) {
        let sw = fs.readFileSync(swPath, 'utf-8');
        // Reemplazar placeholder __BUILD_VERSION__ que viene del public/sw.js
        sw = sw.replace(/__BUILD_VERSION__/g, cacheVersion);
        // Fallback: también reemplazar hardcoded versions por si el placeholder no está
        sw = sw.replace(/cajachica-v[\d.]+-?[\d]*/g, `cajachica-v${cacheVersion}`);
        fs.writeFileSync(swPath, sw);
        console.log(`\n✅ sw.js CACHE_VERSION → cajachica-v${cacheVersion}`);
      }
    }
  };
}

export default defineConfig({
  base: '/KjXkApp/',
  plugins: [react(), syncSwVersion()],
})

export default defineConfig({
  base: '/KjXkApp/',
  plugins: [react(), syncSwVersion()],
})
