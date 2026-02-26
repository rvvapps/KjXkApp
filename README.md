# Caja Chica PWA (MVP) — GitHub Pages (repo: KjXkApp)

Este proyecto es un MVP offline-first en React para:
- Registrar gastos con CR / Cuenta / Partida (desde catálogos)
- Guardar respaldo (foto) en IndexedDB
- Crear rendición seleccionando gastos pendientes
- Exportar Excel usando template `Formulario_Rendicion_Template.xlsx` (sin macros)
- Generar PDF con respaldos (una página por imagen)

## Publicación en GitHub Pages (SIN Node local)
Este repo trae un workflow de GitHub Actions que compila y publica automáticamente.

### 1) Sube el proyecto al repo `KjXkApp`
- Sube estos archivos a la rama `main`.

### 2) Activa GitHub Pages
En GitHub:
- Settings → Pages
- **Build and deployment** → Source: **GitHub Actions**

### 3) Deploy
- Cada `push` a `main` hará build y deploy.
- La URL quedará así:
  `https://<tu_usuario>.github.io/KjXkApp/`

## Template Excel
El template está en:
`public/templates/Formulario_Rendicion_Template.xlsx`

## Notas
- Capacidad por rendición: 42 ítems (14 + 28). Si seleccionas más, exporta en partes.
- iOS PWA: el almacenamiento puede purgarse si el sistema necesita espacio; considera agregar backup/export JSON en una fase posterior.
