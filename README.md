# Gastos 70/30 — Guía de despliegue

## Requisitos
- Node.js 18+ → descargar en nodejs.org
- Cuenta gratis en netlify.com
- Cuenta gratis en github.com

---

## Paso 1 — Instalar dependencias
Abre una terminal dentro de la carpeta `gastos-app` y ejecuta:

```bash
npm install
```

## Paso 2 — Probar en local (opcional)
```bash
npm run dev
```
Abre http://localhost:5173 en tu navegador.

## Paso 3 — Construir la app
```bash
npm run build
```
Esto crea una carpeta `dist/` con los archivos optimizados.

---

## Opción A — Subir a Netlify SIN GitHub (más rápido)

1. Ve a **netlify.com** → Log in → **"Add new site"**
2. Elige **"Deploy manually"**
3. Arrastra la carpeta `dist/` al área de drop
4. ¡Listo! Netlify te da una URL tipo `https://abc123.netlify.app`

---

## Opción B — Subir a Netlify CON GitHub (recomendado para actualizaciones)

1. Sube la carpeta `gastos-app/` a GitHub:
   ```bash
   git init
   git add .
   git commit -m "primer deploy"
   git remote add origin https://github.com/TU_USUARIO/gastos-app.git
   git push -u origin main
   ```

2. Ve a **netlify.com** → **"Add new site"** → **"Import from Git"**
3. Conecta tu cuenta de GitHub
4. Selecciona el repositorio `gastos-app`
5. Configura:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
6. Click **"Deploy site"**

Cada vez que hagas `git push`, Netlify actualiza la app automáticamente.

---

## Paso final — Agregar URL a Dropbox

Una vez tengas tu URL de Netlify (ej: `https://mis-gastos.netlify.app`):

1. Ve a **dropbox.com/developers/apps**
2. Abre tu app → pestaña **Settings**
3. En **"Redirect URIs"** agrega: `https://mis-gastos.netlify.app`
4. Click **Save**

---

## Instalar como app en Android

1. Abre la URL en **Chrome** en tu Android
2. Aparece un banner "Agregar a pantalla de inicio"
   - O menú ⋮ → "Instalar app"
3. ¡Se instala como app nativa con ícono!
