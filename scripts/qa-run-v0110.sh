#!/bin/bash
# ═══════════════════════════════════════════════════════════
# QA v0.11.0 — reproductor a pantalla completa (tipo Spotify)
# Corre TODO en un solo proceso: el dev server tiene que estar
# vivo mientras el navegador reproduce el WAV de prueba.
# ═══════════════════════════════════════════════════════════
cd /home/z/my-project/musictrack || exit 1
mkdir -p /home/z/my-project/qa-v0110

setsid nohup npm run dev > vite-dev.log 2>&1 < /dev/null &
sleep 4

B="agent-browser"

echo "══ 1. abrir + sembrar 4 canciones + lista Gym ══"
$B open http://127.0.0.1:3320 >/dev/null
$B eval "$(cat scripts/qa-seed-v0110.js)"
$B reload >/dev/null
$B wait --load networkidle >/dev/null
$B set viewport 390 844 >/dev/null
$B errors --clear >/dev/null

echo "══ 2. ir a Biblioteca ══"
$B eval "(() => { document.querySelectorAll('nav button')[4].click(); return 'ok' })()"
sleep 1.5
$B screenshot /home/z/my-project/qa-v0110/1-biblioteca.png >/dev/null

echo "══ 3. ▶ primera canción (Corazón de Acero A, favorita) ══"
$B eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Reproducir'); if (!b) return 'NO-BOTON'; b.click(); return 'play' })()"
sleep 2.5
echo "--- estado del audio + mini-barra:"
$B eval "(() => { const a = document.querySelector('audio'); return JSON.stringify({ mini: !!document.querySelector('div[role=region][aria-label=Reproductor]'), sonando: a ? !a.paused : null, seg: a ? Math.round(a.currentTime) : null, dur: a ? Math.round(a.duration) : null }) })()"

echo "══ 4. abrir PANTALLA COMPLETA (tocar portada/título) ══"
$B eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Abrir el reproductor completo'); if (!b) return 'NO-BOTON'; b.click(); return 'abierta' })()"
sleep 1
echo "--- cabecera + título + línea resaltada de la letra:"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); if (!d) return 'NO-DIALOG'; const h = [...d.querySelectorAll('p')].slice(0, 2).map(p => p.textContent).join(' | '); const t = d.querySelector('h2').textContent; const linea = [...d.querySelectorAll('p')].find(p => p.className.includes('scale-')); return h + ' ||| ' + t + ' ||| resaltada: ' + (linea ? linea.textContent : 'ninguna') })()"
$B screenshot /home/z/my-project/qa-v0110/2-completa-letra.png >/dev/null

echo "══ 5. tocar la línea «El dragón despierta» → saltar ahí ══"
$B eval "(() => { const p = [...document.querySelectorAll('div[role=dialog] p')].find(x => x.textContent === 'El dragón despierta'); if (!p) return 'NO-LINEA'; p.click(); return 'salto' })()"
sleep 1.2
echo "--- tras el salto:"
$B eval "(() => { const a = document.querySelector('audio'); const d = document.querySelector('div[role=dialog]'); const linea = [...d.querySelectorAll('p')].find(p => p.className.includes('scale-')); return JSON.stringify({ seg: Math.round(a.currentTime), resaltada: linea ? linea.textContent : 'ninguna' }) })()"

echo "══ 6. pestaña COLA ══"
$B eval "(() => { const b = [...document.querySelectorAll('div[role=dialog] button')].find(x => x.textContent.includes('Cola')); if (!b) return 'NO-TAB'; b.click(); return 'cola' })()"
sleep 0.8
$B screenshot /home/z/my-project/qa-v0110/3-completa-cola.png >/dev/null
echo "--- items de la cola:"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); return [...d.querySelectorAll('ul button')].map(b => b.textContent).join(' /// ') })()"

echo "══ 7. saltar a la versión B desde la cola ══"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const b = [...d.querySelectorAll('ul button')].find(x => x.textContent.includes('versión B')); if (!b) return 'NO-ITEM'; b.click(); return 'salto-B' })()"
sleep 2
echo "--- ahora suena:"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const a = document.querySelector('audio'); return d.querySelector('h2').textContent + ' | seg: ' + Math.round(a.currentTime) })()"

echo "══ 8. 🔁 repetir: off → cola → una (se guarda) ══"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const b = [...d.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Repetir'); b.click(); return localStorage.getItem('musictrack_reproductor-repetir') })()"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const b = [...d.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Repetir'); b.click(); return localStorage.getItem('musictrack_reproductor-repetir') })()"
echo "--- 🔀 aleatorio persiste:"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const b = [...d.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Aleatorio'); b.click(); return localStorage.getItem('musictrack_reproductor-aleatorio') })()"

echo "══ 9. ❤️ favorita desde el reproductor ══"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const b = [...d.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Marcar como favorita'); if (!b) return 'YA-ERA'; b.click(); return 'corazon' })()"
sleep 0.8
$B eval "(() => JSON.parse(localStorage.getItem('musictrack_canciones')).find(c => c.id === 'qa2').favorita)()"

echo "══ 10. ➕ crear lista «Anime» con esta canción ══"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const b = [...d.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Agregar a una lista'); b.click(); return 'modal' })()"
sleep 0.8
$B eval "(() => { const i = document.querySelector('input[placeholder^=Nueva]'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, 'Anime'); i.dispatchEvent(new Event('input', { bubbles: true })); return 'escrito: ' + i.value })()"
$B eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Crear'); b.click(); return 'creada' })()"
sleep 0.8
$B eval "(() => JSON.stringify(JSON.parse(localStorage.getItem('musictrack_listas')).map(l => l.nombre + ':' + l.ids.length)) ()"
$B screenshot /home/z/my-project/qa-v0110/4-modal-lista.png >/dev/null
$B eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Cerrar'); b.click(); return 'modal cerrado' })()"

echo "══ 11. cerrar pantalla completa → la música SIGUE ══"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const b = [...d.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Cerrar el reproductor'); b.click(); return 'cerrada' })()"
sleep 1
echo "--- mini-barra sigue + audio no pausado:"
$B eval "(() => { const a = document.querySelector('audio'); return JSON.stringify({ dialogoCerrado: !document.querySelector('div[role=dialog]'), mini: !!document.querySelector('div[role=region][aria-label=Reproductor]'), sonando: !a.paused, seg: Math.round(a.currentTime) }) })()"
$B screenshot /home/z/my-project/qa-v0110/5-vuelta-mini.png >/dev/null

echo "══ 12. errores de página ══"
$B errors
echo "══ consola (solo errores si los hay) ══"
$B console 2>&1 | grep -i -E "error|warn" | head -10 || echo "(sin errores en consola)"

echo "══ QA v0.11.0 terminado ══"
