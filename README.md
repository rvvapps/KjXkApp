# Caja Chica PWA

> **Versión actual: 0.15.77**

Aplicación web progresiva (PWA) para gestión de caja chica personal. Permite registrar gastos, agruparlos en rendiciones y exportar el formulario corporativo en Excel, todo desde el navegador sin necesidad de instalación ni backend.

**Deploy:** `https://rvvapps.github.io/KjXkApp/`

---

## Características principales

### Registro de gastos
- Ingreso de gastos con concepto, fecha, monto, tipo de documento y número
- Clasificación por Centro de Responsabilidad (CR), Cuenta Contable, Partida y Clasificación
- Adjuntar foto de boleta o voucher (compresión automática de imagen)
- Detección de gastos incompletos (campos obligatorios faltantes)

### Trayectos y combustible
- Registro de recorridos con origen, destino, tipo de vehículo y CR
- Destinos favoritos con monto estimado pre-configurado
- Liquidación de combustible: agrupa N trayectos en un único gasto con el monto real cargado en la bomba

### Rendiciones
- Creación de rendiciones seleccionando gastos pendientes
- Numeración correlativa configurable (ej: RC-001)
- Ciclo de estados: Borrador → Enviada → Aprobada / Devuelta → Pagada
- Posibilidad de corregir rendiciones devueltas (agregar/quitar gastos)
- Exportación del formulario Excel corporativo y PDF con las fotos de los documentos rendidos

### Exportación
- **Excel corporativo**: genera el `Formulario_Rendicion_Template.xlsx` con datos del responsable, lista de gastos y fórmulas de totales. Checkbox "Caja Chica" pre-marcado. Incluye hoja de resumen agrupado por CR → Cuenta → Partida
- **PDF de respaldos**: una página por imagen adjunta, en orden de los gastos

### Sincronización multi-dispositivo
- Sincronización automática entre dispositivos vía OneDrive (Microsoft Graph API)
- Arquitectura outbox/eventos: cada cambio genera un evento que se sube a OneDrive y se descarga en otros dispositivos
- Resolución de conflictos por `updatedAt` (last-write-wins)
- Botón "Re-sincronizar todo" para re-enviar todos los datos desde un dispositivo nuevo o tras un restore

### Backup y restore
- Backup cifrado en formato `.cczip` (ZIP + contraseña mínimo 6 caracteres)
- Descarga local o subida directa a OneDrive
- Restore desde archivo local o desde el último backup en OneDrive

### Catálogos y configuración
- Administración de CR, Cuentas Contables, Partidas y Clasificaciones
- Conceptos de gasto con valores por defecto (cuenta, partida, clasificación)
- Datos personales y bancarios del responsable (se usan en el encabezado del Excel)
- Ayuda contextual integrada en cada sección de la app

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Framework UI | React 18 + React Router 6 |
| Build | Vite 5 |
| Persistencia local | IndexedDB via `idb` |
| Sincronización | OneDrive / Microsoft Graph (MSAL) |
| Excel | ExcelJS 4 |
| PDF | pdf-lib |
| Backup | JSZip + cifrado AES (Web Crypto API) |
| Deploy | GitHub Pages via GitHub Actions |

**Sin backend.** IndexedDB es la fuente de verdad. OneDrive actúa como canal de sincronización, no como base de datos.

---

## Estructura del proyecto

```
src/
├── App.jsx                    # Router, nav, sync triggers
├── db.js                      # IndexedDB schema (v6) y todas las operaciones de datos
├── pages/
│   ├── Dashboard.jsx          # Inicio: KPIs y resumen de estado
│   ├── Expenses.jsx           # Lista de gastos con filtros y acciones
│   ├── NewExpense.jsx         # Formulario nuevo gasto
│   ├── EditExpense.jsx        # Edición de gasto existente
│   ├── Transfers.jsx          # Trayectos y liquidación de combustible
│   ├── Reimbursements.jsx     # Lista de rendiciones
│   ├── ReimbursementDetail.jsx# Detalle, acciones y exportación
│   ├── Catalogs.jsx           # Catálogos (CR, cuentas, partidas, clasificaciones)
│   ├── Concepts.jsx           # Conceptos de gasto
│   └── Settings.jsx           # Ajustes: perfil, app, datos y sync
├── components/
│   ├── HelpButton.jsx         # Ayuda contextual (sheet desde abajo)
│   ├── helpContent.js         # Textos de ayuda por página
│   ├── AttachmentGallery.jsx  # Visor de adjuntos
│   ├── ErrorBanner.jsx        # Banner de errores globales
│   ├── FileCapture.jsx        # Captura y compresión de imágenes
│   ├── SelectField.jsx        # Select estilizado
│   └── TextField.jsx          # Input estilizado
└── services/
    ├── syncEngine.js          # Sync outbox/inbox con OneDrive
    ├── onedriveApi.js         # Microsoft Graph API
    ├── onedriveAuth.js        # MSAL autenticación
    ├── excelExport.js         # Generación Excel (ExcelJS + template)
    ├── excelTemplate.js       # Template .xlsx embebido en base64
    ├── pdfExport.js           # Generación PDF (pdf-lib)
    ├── backupEngine.js        # Backup/restore .cczip
    ├── backupCrypto.js        # Cifrado AES (Web Crypto)
    ├── image.js               # Compresión de imágenes
    └── saveAs.js              # Descarga de archivos / Web Share API
public/
├── sw.js                      # Service Worker (cache + offline)
├── manifest.json              # PWA manifest
└── templates/
    └── Formulario_Rendicion_Template.xlsx
```

### Schema IndexedDB (DB_VERSION 6)

| Store | Key |
|-------|-----|
| `expenses` | `gastoId` |
| `attachments` | `adjuntoId` |
| `reimbursements` | `rendicionId` |
| `reimbursement_items` | `itemId` |
| `transfers` | `transferId` |
| `concepts` | `conceptId` |
| `catalog_cr` | `crCodigo` |
| `catalog_accounts` | `ctaCodigo` |
| `catalog_partidas` | `partidaCodigo` |
| `catalog_clasificaciones` | `clasificacionCodigo` |
| `catalog_destinations` | `destinationId` |
| `settings` | `key` |
| `sync_outbox` | `eventId` |
| `sync_inbox` | `eventId` |
| `sync_state` | `key` |
| `sync_objects` | `contentHash` |

---

## Deploy en GitHub Pages

> No se requiere Node.js local. El build corre íntegramente en GitHub Actions.

### 1. Subir al repo

Sube el contenido de este directorio a la rama `main` del repositorio `KjXkApp`.

### 2. Activar GitHub Pages

En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**

### 3. Deploy automático

Cada `push` a `main` ejecuta el workflow `.github/workflows/deploy.yml`:
- Instala dependencias con `npm install` (sin lockfile)
- Ejecuta `vite build`
- Publica el directorio `dist/` en GitHub Pages

URL resultante: `https://<usuario>.github.io/KjXkApp/`

---

## Configurar sincronización OneDrive

La sincronización requiere una **Azure App Registration** con permisos `Files.ReadWrite` (delegado).

1. Crear app en [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations
2. Agregar redirect URI: `https://<usuario>.github.io/KjXkApp/`
3. En la app: **Ajustes → Datos → Sync — OneDrive**, ingresar Tenant ID y Client ID
4. Tocar **Conectar**

Para sincronizar entre dispositivos, repetir la configuración en cada uno. Si un dispositivo nuevo no recibe los datos existentes, usar **Re-sincronizar todo** desde el dispositivo que los tiene.

---

## Notas operativas

- **Capacidad por rendición:** 42 ítems. Si hay más, el Excel se genera con las primeras 42 filas usando formato extendido.
- **iOS Safari:** las imágenes se convierten a ArrayBuffer antes de guardar en IndexedDB para evitar que la transacción expire.
- **Offline:** la app funciona sin conexión. El sync se ejecuta al abrir, al guardar datos (debounce 1s) y al volver al foco (debounce 2s).
- **Backup recomendado** antes de hacer restore o limpiar datos del sitio.
