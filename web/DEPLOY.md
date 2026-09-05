# Reglas de deploy a producción

Producción es el proyecto de Vercel **comunityagent** (comunitymanager.io), directorio raíz `web/`, rama `visual/os-fusion`. Los deploys se hacen manualmente con `vercel --prod` — **pushear a GitHub NO despliega automáticamente**.

## Las 3 reglas de oro (antes de cualquier `vercel --prod`)

1. **`git pull` primero.** Trae lo que otros hayan pusheado. Nunca trabajes sobre una copia desactualizada.
2. **Commit + `git push` antes de desplegar.** Nunca despliegues un commit que no esté ya en GitHub. Regla simple: *si no está en GitHub, no va a producción.*
3. **Nunca despliegues con el árbol sucio.** `git status` debe estar limpio. Un deploy con cambios sin commitear (`gitDirty: 1` en Vercel) significa que producción no es reproducible desde el repo.

## Secuencia correcta

```bash
git pull
git status          # debe estar limpio
git push
vercel --prod
```

## Por qué existen estas reglas

El 2026-08-26 se desplegó a producción un commit (`d28faea`, adaptador de Cal.com) que nunca se pusheó a GitHub, y encima con archivos sin commitear. Producción quedó corriendo código que no existía en el repositorio: irrecuperable si esa máquina fallaba, y destinado a perderse en el siguiente deploy de cualquier otra persona. Hubo que reconstruir los archivos desde los fuentes que Vercel guarda del deployment, verificándolos hash por hash (recuperados en el commit `408ed24`).

## Recomendación pendiente

Conectar el proyecto a GitHub con auto-deploy (Vercel → Settings → Git → rama de producción `visual/os-fusion`). Así cada push despliega automáticamente y es imposible que producción tenga código fuera del repo. El `vercel --prod` manual quedaría solo para emergencias.

## Notas

- Configura tu identidad de git en cada máquina: `git config --global user.name "..."` y `git config --global user.email "..."`.
- Si tu editor usa finales de línea CRLF (Windows), configura `git config --global core.autocrlf input` para que el repo se mantenga en LF.
