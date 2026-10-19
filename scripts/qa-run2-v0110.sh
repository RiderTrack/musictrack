#!/bin/bash
# ═══════════════════════════════════════════════════════════
# QA v0.11.0 — ROUND 2: clics CONFIABLES (refs del snapshot,
# gesto real → el autoplay de Chromium lo respeta)
# ═══════════════════════════════════════════════════════════
cd /home/z/my-project/musictrack || exit 1

setsid nohup npm run dev > vite-dev.log 2>&1 < /dev/null &
sleep 4

B="agent-browser"
ref() { $B snapshot -i -c 2>/dev/null | grep "$1" | head -1 | grep -o '\[ref=e[0-9]*\]' | sed 's/\[ref=//;s/\]//'; }

echo "══ 1. reset: sembrar + Biblioteca ══"
$B open http://127.0.0.1:3320 >/dev/null
$B eval "$(cat scripts/qa-seed-v0110.js)" >/dev/null
$B reload >/dev/null
$B wait --load networkidle >/dev/null
$B set viewport 390 844 >/dev/null
$B errors --clear >/dev/null
$B eval "(() => { document.querySelectorAll('nav button')[4].click(); return 'ok' })()" >/dev/null
sleep 1.5

echo "══ 2. ▶ visible (carpeta Power Metal, carta de qa1) ══"
R=$(ref 'button "Reproducir" \[ref=')
echo "ref Reproducir: $R"
$B click @$R
sleep 2.5
$B eval "(() => { const a = document.querySelector('audio'); return JSON.stringify({ mini: !!document.querySelector('div[role=region][aria-label=Reproductor]'), sonando: a ? !a.paused : null, seg: a ? Math.round(a.currentTime) : null }) })()"

echo "══ 3. abrir pantalla completa (gesto real) ══"
R=$(ref 'button "Abrir el reproductor completo"')
echo "ref abrir: $R"
$B click @$R
sleep 1.2
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); if (!d) return 'NO-DIALOG'; const a = document.querySelector('audio'); return [...d.querySelectorAll('p')].slice(0, 2).map(p => p.textContent).join(' | ') + ' ||| sonando: ' + !a.paused })()"

echo "══ 4. 🔁 repetir ciclo completo (off→cola→una→off) ══"
$B eval "(() => { [...document.querySelectorAll('div[role=dialog] button')].find(x => x.getAttribute('aria-label') === 'Repetir').click(); return 1 })()" >/dev/null; sleep 0.6
echo "tras 1er clic: $( $B eval "localStorage.getItem('musictrack_reproductor-repetir')" )"
$B eval "(() => { [...document.querySelectorAll('div[role=dialog] button')].find(x => x.getAttribute('aria-label') === 'Repetir').click(); return 1 })()" >/dev/null; sleep 0.6
echo "tras 2do clic: $( $B eval "localStorage.getItem('musictrack_reproductor-repetir')" )"
$B eval "(() => { [...document.querySelectorAll('div[role=dialog] button')].find(x => x.getAttribute('aria-label') === 'Repetir').click(); return 1 })()" >/dev/null; sleep 0.6
echo "tras 3er clic: $( $B eval "localStorage.getItem('musictrack_reproductor-repetir')" )"

echo "══ 5. pestaña COLA (gesto real) ══"
R=$(ref 'button "Cola')
echo "ref cola: $R"
$B click @$R
sleep 0.8
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); return [...d.querySelectorAll('ul button')].map(b => b.textContent).join(' /// ') })()"
$B screenshot /home/z/my-project/qa-v0110/r2-cola.png >/dev/null

echo "══ 6. saltar a la versión B (gesto real) ══"
R=$(ref 'versión B')
echo "ref versión B: $R"
$B click @$R
sleep 2.2
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); const a = document.querySelector('audio'); const item = [...d.querySelectorAll('ul button')].find(b => b.className.includes('bg-white/5') || b.textContent.includes('versión B')); return 'subtítulo B visible: ' + (d.body = '', [...d.querySelectorAll('span')].some(s => s.textContent.includes('versión B ·'))) + ' | sonando: ' + !a.paused + ' | seg: ' + Math.round(a.currentTime) })()"

echo "══ 7. ❤️ favorita (qa2, vía eval — es dato puro) ══"
$B eval "(() => { const b = [...document.querySelectorAll('div[role=dialog] button')].find(x => x.getAttribute('aria-label') === 'Marcar como favorita'); if (!b) return 'NO-BOTON'; b.click(); return 'corazon' })()" >/dev/null
sleep 0.8
echo "qa2.favorita = $( $B eval "JSON.parse(localStorage.getItem('musictrack_canciones')).find(c => c.id === 'qa2').favorita" )"

echo "══ 8. ➕ mandar a la lista Gym + crear Anime ══"
$B eval "(() => { [...document.querySelectorAll('div[role=dialog] button')].find(x => x.getAttribute('aria-label') === 'Agregar a una lista').click(); return 1 })()" >/dev/null
sleep 0.8
$B eval "(() => { const cbs = [...document.querySelectorAll('input[type=checkbox]')]; const gym = cbs[cbs.length - 1]; gym.click(); return 'gym clic' })()" >/dev/null
sleep 0.5
$B eval "(() => { const i = document.querySelector('input[placeholder^=Nueva]'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, 'Anime'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()" >/dev/null
$B eval "(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Crear').click(); return 1 })()" >/dev/null
sleep 0.8
$B eval "(() => JSON.stringify(JSON.parse(localStorage.getItem('musictrack_listas')).map(l => l.nombre + ':' + l.ids.join(','))) ()"
$B screenshot /home/z/my-project/qa-v0110/r2-modal.png >/dev/null
$B eval "(() => { [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Cerrar').click(); return 1 })()" >/dev/null

echo "══ 9. cerrar → la música sigue en la mini-barra ══"
$B eval "(() => { const d = document.querySelector('div[role=dialog]'); [...d.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Cerrar el reproductor').click(); return 1 })()" >/dev/null
sleep 1.2
$B eval "(() => { const a = document.querySelector('audio'); return JSON.stringify({ dialogoCerrado: !document.querySelector('div[role=dialog]'), mini: !!document.querySelector('div[role=region][aria-label=Reproductor]'), sonando: !a.paused, seg: Math.round(a.currentTime) }) })()"
$B screenshot /home/z/my-project/qa-v0110/r2-final-mini.png >/dev/null

echo "══ 10. errores de página ══"
$B errors
$B console 2>&1 | grep -i -E "error|warn" | head -8 || echo "(consola limpia)"
echo "══ ROUND 2 terminado ══"
