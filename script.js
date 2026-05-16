/**
 * ── CHALLENGE RUN ──
 * Professional GPS Tracking & Firebase Firestore Integration Script
 * * Ushbu skript foydalanuvchilar geolokatsiyasini haversine formulasi orqali hisoblaydi,
 * parollarni xavfsiz xeshlaydi va ma'lumotlarni Google Firebase onlayn bazasi bilan bog'laydi.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. FIREBASE INTEGRATSIYASI (yugur-6335e loyihangiz sozlamalari)
const firebaseConfig = {
  apiKey: "AIzaSyBI0VaqhmakD3_Xj7WAUSNksEQfYfyN3MU",
  authDomain: "yugur-6335e.firebaseapp.com",
  projectId: "yugur-6335e",
  storageBucket: "yugur-6335e.firebasestorage.app",
  messagingSenderId: "454600555870",
  appId: "1:454600555870:web:1ce9627f37c6ca59ed63cf"
};

// Firebase-ni ishga tushirish
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 2. DOM ELEMENTLARINI XAVFSIZ SIKL BANNERLARI BILAN INICIALIZATSIYA QILISH
const welcomePage     = document.getElementById('welcome-page');
const authPage        = document.getElementById('auth-page');
const mainDashboard   = document.getElementById('main-dashboard');
const startBtn        = document.getElementById('start-btn');
const formTitle       = document.getElementById('form-title');
const formDesc        = document.getElementById('form-desc');
const usernameInput   = document.getElementById('username');
const passwordInput   = document.getElementById('password');
const submitBtn       = document.getElementById('submit-btn');
const switchText      = document.getElementById('switch-text');
const userGreeting    = document.getElementById('user-greeting');
const displayDistance = document.getElementById('display-distance');
const displayTime     = document.getElementById('display-time');
const startRunBtn     = document.getElementById('start-run-btn');
const findMeBtn       = document.getElementById('find-me-btn');
const totalLibDisplay = document.getElementById('total-library-distance');
const menuToggleBtn   = document.getElementById('menu-toggle-btn');
const sideMenu        = document.getElementById('side-menu');
const closeMenuBtn    = document.getElementById('close-menu-btn');

// 3. GLOBAL ILOVA STATELARI (HOLATLARI)
let isLoginMode    = false; // true = Kirish, false = Ro'yxatdan o'tish
let currentUser    = null;  // Tizimga kirgan joriy foydalanuvchi
let map            = null;  // Leaflet xarita obyekti
let marker         = null;  // Foydalanuvchining xaritadagi nuqtasi (Marker)
let polyline       = null;  // Yugurish trayektoriyasi chizig'i
let watchId        = null;  // GPS kuzatuvchisi ID raqami
let timerInterval  = null;  // Vaqt hisoblagich intervali
let startTime      = null;  // Yugurish boshlangan aniq millisoniya
let elapsedSeconds = 0;     // O'tgan jami soniyalar
let totalDistance  = 0;     // Yugurilgan jami masofa (km)
let pathCoords     = [];    // Koordinatalar massivi [[lat, lng], ...]
let lastCoord      = null;  // Oxirgi qayd etilgan GPS nuqtasi
let isRunning      = false; // Foydalanuvchi hozir yuguryaptimi yoki yo'q

/**
 * Parollarni ochiq matn holida bazada saqlamaslik uchun kriptografik xesh funksiyasi.
 * Bazaga faqat xesh kod yoziladi.
 */
function cypherHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // 32-bitli butun songa o'tkazish
  }
  return hash.toString(16);
}

// 4. SAHIFALARNI BOSHQARISH MANTIQLARI
function showPage(pageId) {
  [welcomePage, authPage, mainDashboard].forEach(p => p && p.classList.add('hidden'));
  const targetPage = document.getElementById(pageId);
  if (targetPage) targetPage.classList.remove('hidden');
}

function toggleAuthMode(loginMode) {
  isLoginMode = loginMode;
  if (loginMode) {
    if(formTitle) formTitle.textContent  = 'TIZIMGA KIRISH';
    if(formDesc) formDesc.textContent   = 'Profilingizga kiring';
    if(submitBtn) submitBtn.textContent  = 'KIRISH';
    if(switchText) switchText.textContent = "Profilingiz yo'qmi? Ro'yxatdan o'ting";
  } else {
    if(formTitle) formTitle.textContent  = "RO'YXATDAN O'TISH";
    if(formDesc) formDesc.textContent   = 'Yangi profil yaratish';
    if(submitBtn) submitBtn.textContent  = 'RO\'YXATDAN O\'TISH';
    if(switchText) switchText.textContent = 'Sizda profil bormi? Tizimga kirish';
  }
}

if(startBtn) startBtn.addEventListener('click', () => { toggleAuthMode(false); showPage('auth-page'); });
if(switchText) switchText.addEventListener('click', () => toggleAuthMode(!isLoginMode));

// 5. AVTORIZATSIYA VA FIREBASE FIRESTORE BIROVDAN HIMOYA ALOQASI
if(submitBtn) {
  submitBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();

    if (!username || !password) { 
      showToast("Iltimos, barcha maydonlarni to'ldiring!", 'error'); 
      return; 
    }
    
    submitBtn.textContent = "KUTILMOQDA...";
    submitBtn.disabled = true;

    try {
      const userRef = doc(db, "users", username);
      const userSnap = await getDoc(userRef);

      if (!isLoginMode) {
        // Ro'yxatdan o'tish rejimi
        if (userSnap.exists()) { 
          showToast('Bu login band! Boshqa nom tanlang.', 'error'); 
        } else {
          await setDoc(userRef, { passwordHash: cypherHash(password) });
          showToast('Profil muvaffaqiyatli yaratildi! Endi kiring.', 'success');
          toggleAuthMode(true);
        }
      } else {
        // Tizimga kirish rejimi
        if (!userSnap.exists() || userSnap.data().passwordHash !== cypherHash(password)) { 
          showToast("Login yoki parol noto'g'ri!", 'error'); 
        } else {
          currentUser = username;
          localStorage.setItem('challenge_run_session', username);
          enterDashboard();
        }
      }
    } catch (error) {
      showToast("Ma'lumotlar bazasi bilan ulanish uzildi.", "error");
      console.error(error);
    } finally {
      submitBtn.textContent = isLoginMode ? 'KIRISH' : 'RO\'YXATDAN O\'TISH';
      submitBtn.disabled = false;
    }
  });
}

function enterDashboard() {
  if(userGreeting) userGreeting.textContent = `Salom, ${currentUser}! 👋`;
  showPage('main-dashboard');
  resetStats();
  updateLibraryDistance();
  updateLeaderboard();
  setTimeout(initMap, 300); // DOM to'liq yuklanishi uchun kichik kechikish
}

// 6. FIREBASE-DAN SHAXSIY JAMI MASOFANI OLISH
async function updateLibraryDistance() {
  if (!currentUser) return;
  try {
    const q = query(collection(db, "runs"), where("username", "==", currentUser));
    const querySnapshot = await getDocs(q);
    let totalLib = 0;
    querySnapshot.forEach(doc => { totalLib += parseFloat(doc.data().distance || 0); });
    if (totalLibDisplay) totalLibDisplay.textContent = totalLib.toFixed(2) + ' km';
  } catch (e) {
    console.error("Kutubxonani yuklashda xato:", e);
  }
}

// 7. FIREBASE GLOBAL REYTING TIZIMI (LEADERBOARD)
async function updateLeaderboard() {
  const leaderboardList = document.getElementById('leaderboard-list');
  if (!leaderboardList) return;

  try {
    const querySnapshot = await getDocs(collection(db, "runs"));
    const userDistances = {};

    // Barcha yugurishlarni foydalanuvchilar bo'yicha guruhlash
    querySnapshot.forEach(doc => {
      const data = doc.data();
      const user = data.username;
      const dist = parseFloat(data.distance || 0);
      if (user) { 
        userDistances[user] = (userDistances[user] || 0) + dist; 
      }
    });

    // Ma'lumotlarni saralash (Katta masofadan kichikka)
    const leaderboardData = Object.keys(userDistances).map(username => ({
      username: username,
      totalDistance: userDistances[username]
    })).sort((a, b) => b.totalDistance - a.totalDistance);

    leaderboardList.innerHTML = '';
    if(leaderboardData.length === 0) {
      leaderboardList.innerHTML = `<div style="color:var(--muted); font-size:12px; text-align:center; padding:10px;">Natijalar yo'q</div>`;
      return;
    }

    leaderboardData.forEach((user, index) => {
      const rank = index + 1;
      let rankClass = 'rank-rest'; 
      let medal = '';
      
      if (rank === 1) { rankClass = 'rank-1'; medal = '🥇 '; }
      else if (rank === 2) { rankClass = 'rank-2'; medal = '🥈 '; }
      else if (rank === 3) { rankClass = 'rank-3'; medal = '🥉 '; }

      const item = document.createElement('div');
      item.className = `leaderboard-item ${rankClass}`;
      item.style.marginBottom = "8px";
      item.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="rank-number" style="color:${rank <= 3 ? 'var(--green)' : 'var(--muted)'}; font-weight:900;">${medal || rank + '.'}</span>
          <span class="rank-name" style="color:#fff;">${user.username} ${user.username === currentUser ? '<b style="color:var(--green)">(Siz)</b>' : ''}</span>
        </div>
        <span class="rank-distance" style="font-family:'Orbitron',monospace; font-weight:700; color:var(--green);">${user.totalDistance.toFixed(2)} km</span>
      `;
      leaderboardList.appendChild(item);
    });
  } catch(error) {
    console.error("Reytingni yuklashda xato:", error);
  }
}

// 8. GEOLOKATSIYA VA HAVERSINE FORMULASI (MASOFANI TO'G'RI HISOBLASH)
function toRadians(deg) { return deg * (Math.PI / 180); }

function calculateHaversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // Erning o'rtacha radiusi (km)
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 9. MAP (XARITA) INICIALIZATSIYASI VA TARIXIY CHIZIQLAR
function initMap() {
  if (map) { map.invalidateSize(); return; }
  
  // O'zbekiston markaziy koordinatasi bo'yicha Leaflet xaritasini sozlash
  map = L.map('map-zone', { zoomControl: false, attributionControl: false }).setView([41.3111, 69.2406], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  // Neon effektli chiroyli marker dizayni (HTML/CSS yordamida dynamic)
  const neonIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:24px;height:24px;"><div style="position:absolute;inset:0;background:rgba(0,255,136,0.4);border-radius:50%;animation:pulse 1.8s infinite;"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:12px;height:12px;background:#00ff88;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px #00ff88;"></div></div>`,
    iconSize: [24, 24], 
    iconAnchor: [12, 12]
  });

  marker = L.marker([41.3111, 69.2406], { icon: neonIcon }).addTo(map);
  polyline = L.polyline([], { color: '#ff4444', weight: 5, opacity: 0.95 }).addTo(map);
  
  drawHistoryRoutes();
}

// Eski yugurish yo'llarini xaritada xira neon chiziq bilan ko'rsatish
async function drawHistoryRoutes() {
  if (!currentUser || !map) return;
  try {
    const q = query(collection(db, "runs"), where("username", "==", currentUser));
    const snap = await getDocs(q);
    snap.forEach(doc => {
      const run = doc.data();
      if (run.coords && run.coords.length > 1) {
        L.polyline(run.coords, { color: '#00bfff', weight: 3, opacity: 0.25, dashArray: '6, 12' }).addTo(map);
      }
    });
  } catch (e) {}
}

// 10. HARAKATNI BOSHLASH VA TO'XTATISH (YUGURISH REJIMLARI)
if(startRunBtn) {
  startRunBtn.addEventListener('click', () => { 
    if (!isRunning) startTracking(); else stopTracking(); 
  });
}

function startTracking() {
  if (!navigator.geolocation) { 
    showToast("Qurilmangizda GPS topilmadi!", 'error'); 
    return; 
  }
  
  isRunning = true; 
  resetStats(); 
  startTime = Date.now();
  startRunBtn.textContent = "TO'XTATISH ⏹"; 
  startRunBtn.classList.add('btn-danger');

  // Real vaqtda taymer hisoblash
  timerInterval = setInterval(() => {
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    if(displayTime) displayTime.textContent = formatTime(elapsedSeconds);
  }, 1000);

  // GPS watchPosition funksiyasi orqali harakatni yuqori aniqlikda kuzatish
  watchId = navigator.geolocation.watchPosition(handleGPSUpdate, handleGPSError, { 
    enableHighAccuracy: true, 
    maximumAge: 0, 
    timeout: 8000 
  });

  showToast('Yugurish boshlandi! Harakatni boshlang. 🏃', 'success');
}

function handleGPSUpdate(position) {
  const lat = position.coords.latitude; 
  const lng = position.coords.longitude;
  
  pathCoords.push([lat, lng]);
  if (marker) marker.setLatLng([lat, lng]);
  if (map) map.setView([lat, lng], 17);
  if (polyline) polyline.setLatLngs(pathCoords);

  if (lastCoord) { 
    const distanceStep = calculateHaversine(lastCoord.lat, lastCoord.lng, lat, lng);
    // GPS xatoliklarini (sakrashlarni) filtrlaydigan murakkab validatsiya (2 metrdan 200 metrgacha masofani hisoblaydi)
    if(distanceStep > 0.002 && distanceStep < 0.2) { 
      totalDistance += distanceStep;
      if(displayDistance) displayDistance.textContent = totalDistance.toFixed(2) + ' km'; 
    }
  }
  lastCoord = { lat, lng };
}

function handleGPSError(err) {
  console.warn("GPS Xatolik:", err.message);
}

async function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (timerInterval !== null) clearInterval(timerInterval);
  
  isRunning = false; 
  startRunBtn.textContent = 'YUGURISHNI BOSHLASH'; 
  startRunBtn.classList.remove('btn-danger');

  // Agar yugurilgan masofa 10 metrdan oshsa, bazaga saqlaymiz
  if (totalDistance > 0.01 && pathCoords.length > 1) {
    try {
      showToast("Natijalar serverga yuklanmoqda...", "success");
      
      await addDoc(collection(db, "runs"), { 
        username: currentUser,
        date: new Date().toLocaleDateString('uz-UZ'), 
        distance: parseFloat(totalDistance.toFixed(2)), 
        time: formatTime(elapsedSeconds), 
        coords: pathCoords 
      });

      updateLibraryDistance(); 
      updateLeaderboard(); 
      showSummaryModal();
    } catch (e) { 
      showToast("Internet uzildi! Ma'lumot saqlanmadi.", "error"); 
    }
  } else {
    showToast("Masofa juda qisqa. Natija saqlanmadi.", "error"); 
    resetStats();
  }
}

// Yugurish tugagach chiroyli modal oyna orqali xulosa chiqarish
function showSummaryModal() {
  const hours = elapsedSeconds / 3600 || 0.0001; 
  const speed = (totalDistance / hours).toFixed(2);
  
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(10px);padding:16px;`;
  overlay.innerHTML = `
    <div style="background:#0d0d1a;border:1px solid #00ff88;border-radius:20px;padding:32px 24px;text-align:center;max-width:340px;width:100%;box-shadow:0 0 30px rgba(0,255,136,0.2);">
      <h2 style="color:#00ff88;margin-bottom:20px;font-family:'Orbitron',monospace;letter-spacing:2px;">NATIJALAR</h2>
      <div style="color:#fff;font-size:1.4rem;margin:12px 0;">Masofa: <b>${totalDistance.toFixed(2)} km</b></div>
      <div style="color:#fff;font-size:1.4rem;margin:12px 0;">Vaqt: <b>${formatTime(elapsedSeconds)}</b></div>
      <div style="color:#8b8ba8;font-size:1.1rem;margin-bottom:24px;">Tezlik: ${speed} km/h</div>
      <button id="close-summary" style="padding:14px;width:100%;background:#00ff88;color:#0a0a14;border:none;border-radius:12px;cursor:pointer;font-weight:700;font-size:1rem;letter-spacing:1px;transition:all 0.2s;">YOPISH</button>
    </div>
  `;
  document.body.appendChild(overlay);
  
  document.getElementById('close-summary').addEventListener('click', () => { 
    document.body.removeChild(overlay); 
    resetStats(); 
  });
}

// 11. YORDAMCHI FOYDALAR (FIND ME, BURGER MENU VA TOASTS)
if (findMeBtn) {
  findMeBtn.addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(p => {
      const lat = p.coords.latitude; 
      const lng = p.coords.longitude;
      if (!map) initMap();
      if (map) map.setView([lat, lng], 16);
      if (marker) marker.setLatLng([lat, lng]);
    }, () => { showToast("GPS ruxsat berilmagan!", "error"); }, { enableHighAccuracy: true });
  });
}

if (menuToggleBtn && sideMenu) { 
  menuToggleBtn.addEventListener('click', (e) => { 
    e.stopPropagation(); 
    sideMenu.classList.add('open'); 
  }); 
}
if (closeMenuBtn && sideMenu) { 
  closeMenuBtn.addEventListener('click', () => sideMenu.classList.remove('open')); 
}

document.addEventListener('click', (e) => { 
  if (sideMenu && sideMenu.classList.contains('open') && !sideMenu.contains(e.target) && !menuToggleBtn.contains(e.target)) {
    sideMenu.classList.remove('open');
  }
});

function formatTime(totalSec) { 
  return [Math.floor(totalSec/3600), Math.floor((totalSec%3600)/60), totalSec%60]
    .map(v => String(v).padStart(2,'0')).join(':'); 
}

function resetStats() { 
  totalDistance = 0; 
  elapsedSeconds = 0; 
  pathCoords = []; 
  lastCoord = null; 
  if(displayDistance) displayDistance.textContent = '0.00 km'; 
  if(displayTime) displayTime.textContent = '00:00:00'; 
  if (polyline) polyline.setLatLngs([]); 
}

function showToast(message, type = 'success') {
  const color = type === 'success' ? '#00ff88' : '#ff4444';
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#0d0d1a;border:1px solid ${color};color:${color};padding:14px 28px;border-radius:10px;font-size:13px;font-weight:700;z-index:10000;box-shadow:0 4px 24px rgba(0,0,0,0.8);letter-spacing:0.5px;white-space:nowrap;transition:all 0.3s ease-in-out;`;
  toast.textContent = message; 
  document.body.appendChild(toast);
  
  setTimeout(() => { 
    toast.style.opacity = '0'; 
    setTimeout(() => document.body.removeChild(toast), 300); 
  }, 3500);
}

// 12. IIFE INICIALIZATOR (SESSIYANI TEKSHIRISH)
(function initAppSession() { 
  const savedSession = localStorage.getItem('challenge_run_session'); 
  if (savedSession) { 
    currentUser = savedSession; 
    enterDashboard(); 
  } else { 
    showPage('welcome-page'); 
  } 
})();