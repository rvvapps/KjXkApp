import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Plugin: actualiza CACHE_VERSION en sw.js con la versión del package.json
function syncSwVersion() {
  return {
    name: 'sync-sw-version',
    writeBundle() {
      const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
      const appVersion = pkg.version || '0.0.0';
      // Leer Settings.jsx para obtener APP_VERSION real (ej: "0.15.31")
      const settingsPath = './src/pages/Settings.jsx';
      let cacheVersion = appVersion;
      if (fs.existsSync(settingsPath)) {
        const match = fs.readFileSync(settingsPath, 'utf-8').match(/APP_VERSION\s*=\s*"([^"]+)"/);
        if (match) cacheVersion = match[1];
      }
      const swPath = path.resolve('./dist/sw.js');
      if (fs.existsSync(swPath)) {
        let sw = fs.readFileSync(swPath, 'utf-8');
        sw = sw.replace(/const CACHE_VERSION = "cajachica-v[\d.]+";/, `const CACHE_VERSION = "cajachica-v${cacheVersion}";`);
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
