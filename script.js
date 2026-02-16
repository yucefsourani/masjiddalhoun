/* ==============================
   MOSQUE DASHBOARD — SCRIPT
   ============================== */

(function () {
    'use strict';

    // --- Config (loaded from config.js global) ---
    var CONFIG = window.MOSQUE_CONFIG;

    if (!CONFIG) {
        console.error('MOSQUE_CONFIG not found! Make sure config.js is loaded before script.js');
        return;
    }

    // --- State ---
    var prayerTimesData = null;
    var imsakTime = null;
    var hijriDateStr = '';
    var lastNextIdx = -1;
    var iqamaPlayed = false;
    var currentAudio = null;
    var audioUnlocked = false;
    var audioContext = null;
    var pendingSound = null;

    // Prayer definitions (order matters)
    var PRAYERS = [
        { key: 'Fajr', nameAr: 'الفجر', icon: '🌅' },
        { key: 'Sunrise', nameAr: 'الشروق', icon: '☀️' },
        { key: 'Dhuhr', nameAr: 'الظهر', icon: '🌞' },
        { key: 'Asr', nameAr: 'العصر', icon: '🌤️' },
        { key: 'Maghrib', nameAr: 'المغرب', icon: '🌅' },
        { key: 'Isha', nameAr: 'العشاء', icon: '🌙' }
    ];

    // Arabic day names
    var ARABIC_DAYS = [
        'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء',
        'الخميس', 'الجمعة', 'السبت'
    ];

    // ============================
    //  MONTH NAMING TABLES
    // ============================

    var MONTH_NAMES = {
        levant: [
            'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
            'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'
        ],
        egyptian: [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ],
        maghreb: [
            'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
            'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ],
        iraqi: [
            'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'مايس', 'حزيران',
            'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'
        ],
        english: [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ],
        french: [
            'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ]
    };


    // ============================
    //  HELPER: Get local date parts in mosque timezone
    // ============================

    function getLocalDateParts(now) {
        var tz = CONFIG.timezone;
        // Get individual parts to avoid locale formatting issues
        var year = parseInt(now.toLocaleDateString('en-US', { year: 'numeric', timeZone: tz }), 10);
        var month = parseInt(now.toLocaleDateString('en-US', { month: 'numeric', timeZone: tz }), 10);
        var day = parseInt(now.toLocaleDateString('en-US', { day: 'numeric', timeZone: tz }), 10);
        var weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz });
        var dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(weekday);
        return { year: year, month: month, day: day, dayIndex: dayIndex };
    }

    function getLocalTimeParts(now) {
        var tz = CONFIG.timezone;
        var timeStr = now.toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false, timeZone: tz
        });
        var parts = timeStr.split(':');
        return {
            hours: parseInt(parts[0], 10),
            minutes: parseInt(parts[1], 10),
            seconds: parseInt(parts[2], 10),
            raw: timeStr
        };
    }

    // ============================
    //  HELPER: Format time for display (12h or 24h)
    // ============================

    function formatTimeForDisplay(timeStr24) {
        // Input: "HH:MM" or "HH:MM:SS" in 24h format
        var parts = timeStr24.split(':');
        var h = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10);
        var s = parts.length > 2 ? parseInt(parts[2], 10) : null;

        if (CONFIG.timeFormat === '12h') {
            var period = h >= 12 ? 'PM' : 'AM';
            var h12 = h % 12;
            if (h12 === 0) h12 = 12;
            var result = pad(h12) + ':' + pad(m);
            if (s !== null) result += ':' + pad(s);
            result += ' ' + period;
            return result;
        } else {
            var result24 = pad(h) + ':' + pad(m);
            if (s !== null) result24 += ':' + pad(s);
            return result24;
        }
    }

    // Get the month name from the config style
    function getMonthName(monthIndex) {
        var style = CONFIG.monthNamingStyle || 'egyptian';
        var names = MONTH_NAMES[style] || MONTH_NAMES['egyptian'];
        return names[monthIndex]; // 0-indexed
    }

    // ============================
    //  INITIALIZATION
    // ============================

    function init() {

        // Each section initializes independently
        try { setupBackground(); } catch (e) { console.error('Background error:', e); }
        try { setupHeader(); } catch (e) { console.error('Header error:', e); }
        try { setupDailyMessage(); } catch (e) { console.error('Message error:', e); }
        try { setupRefreshButton(); } catch (e) { console.error('Refresh button error:', e); }
        try { startClock(); } catch (e) { console.error('Clock error:', e); }
        try { setupAudioUnlock(); } catch (e) { console.error('Audio unlock error:', e); }

        // API calls (async, non-blocking)
        fetchPrayerTimes();
        fetchWeather();
    }

    // ============================
    //  AUDIO UNLOCK (Autoplay Policy)
    // ============================
    // Browsers block audio.play() unless the user has interacted with the page.
    // This creates a banner prompting the user to click, which unlocks audio.

    function setupAudioUnlock() {
        // Check if audio needs any config at all
        var hasAdhan = (CONFIG.adhanSounds && CONFIG.adhanSounds.length > 0)
            || (CONFIG.fajrAdhanSounds && CONFIG.fajrAdhanSounds.length > 0);
        var hasIqama = CONFIG.iqamaSounds && CONFIG.iqamaSounds.length > 0;

        if (!hasAdhan && !hasIqama) {
            // No sounds configured — no need for banner
            audioUnlocked = true;
            return;
        }

        // Check if user has previously approved audio
        var previouslyApproved = false;
        try { previouslyApproved = localStorage.getItem('audio_approved') === 'true'; } catch (e) { /* ignore */ }

        if (previouslyApproved) {
            // Try to silently auto-unlock (works on most browsers for returning visitors)
            trySilentUnlock();
        } else {
            // First visit — show the banner
            showAudioBanner();
            addGlobalUnlockListeners();
        }
    }

    function trySilentUnlock() {
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC) {
                audioContext = new AC();
                if (audioContext.state === 'running') {
                    // AudioContext already running — audio is allowed
                    audioUnlocked = true;
                    console.log('Audio auto-unlocked (returning visitor)');
                    return;
                }

                // Try to resume — some browsers allow this for returning visitors
                audioContext.resume().then(function () {
                    if (audioContext.state === 'running') {
                        audioUnlocked = true;
                        console.log('Audio auto-unlocked via AudioContext resume');
                    } else {
                        // Browser still blocking — show banner as fallback
                        showAudioBanner();
                        addGlobalUnlockListeners();
                    }
                }).catch(function () {
                    showAudioBanner();
                    addGlobalUnlockListeners();
                });
            } else {
                // No AudioContext support — assume it works
                audioUnlocked = true;
            }
        } catch (e) {
            showAudioBanner();
            addGlobalUnlockListeners();
        }
    }

    function addGlobalUnlockListeners() {
        var unlockEvents = ['click', 'touchstart', 'keydown'];
        function globalUnlock() {
            unlockAudio();
            unlockEvents.forEach(function (evt) {
                document.removeEventListener(evt, globalUnlock);
            });
        }
        unlockEvents.forEach(function (evt) {
            document.addEventListener(evt, globalUnlock, { once: false });
        });
    }

    function showAudioBanner() {
        // Create banner element if it doesn't exist
        var existing = document.getElementById('audio-unlock-banner');
        if (existing) return;

        var banner = document.createElement('div');
        banner.id = 'audio-unlock-banner';
        banner.className = 'audio-unlock-banner';

        var iconSpan = document.createElement('span');
        iconSpan.className = 'audio-unlock-icon';
        iconSpan.textContent = '\uD83D\uDD07';

        var textSpan = document.createElement('span');
        textSpan.className = 'audio-unlock-text';
        textSpan.textContent = '\u0627\u0636\u063A\u0637 \u0647\u0646\u0627 \u0644\u062A\u0641\u0639\u064A\u0644 \u0635\u0648\u062A \u0627\u0644\u0623\u0630\u0627\u0646';

        banner.appendChild(iconSpan);
        banner.appendChild(textSpan);
        banner.addEventListener('click', function () {
            unlockAudio();
        });

        document.body.appendChild(banner);
    }

    function unlockAudio() {
        if (audioUnlocked) return;

        try {
            // Create and resume AudioContext to satisfy browser autoplay policy
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC) {
                if (!audioContext) audioContext = new AC();
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
            }

            // Play a tiny silent buffer to fully unlock the audio pipeline
            var silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
            silentAudio.volume = 0;
            silentAudio.play().then(function () {
                silentAudio.pause();
                silentAudio = null;
            }).catch(function () { /* ignore */ });

        } catch (e) {
            console.warn('AudioContext unlock failed:', e);
        }

        audioUnlocked = true;
        console.log('Audio unlocked by user interaction');

        // Save approval permanently
        try { localStorage.setItem('audio_approved', 'true'); } catch (e) { /* ignore */ }

        // Hide banner
        var banner = document.getElementById('audio-unlock-banner');
        if (banner) {
            banner.classList.add('audio-unlocked');
            setTimeout(function () {
                if (banner.parentNode) banner.parentNode.removeChild(banner);
            }, 500);
        }

        // Play pending sound if one was queued while locked
        if (pendingSound) {
            var file = pendingSound;
            pendingSound = null;
            playSound(file);
        }
    }

    // ============================
    //  BACKGROUND
    // ============================

    function setupBackground() {
        var opacity = (typeof CONFIG.backgroundOpacity === 'number') ? CONFIG.backgroundOpacity : 0.1;
        document.documentElement.style.setProperty('--bg-pattern-opacity', opacity);
    }

    // ============================
    //  HEADER
    // ============================

    function setupHeader() {
        var nameEl = document.getElementById('mosque-name');
        var iconEl = document.getElementById('mosque-icon');

        nameEl.textContent = CONFIG.mosqueName || 'المسجد';
        document.title = CONFIG.mosqueName || 'لوحة بيانات المسجد';

        if (CONFIG.mosqueIcon && CONFIG.mosqueIcon.length > 0) {
            iconEl.src = CONFIG.mosqueIcon;
            iconEl.classList.remove('hidden');
            iconEl.onerror = function () { iconEl.classList.add('hidden'); };
        }
    }

    // ============================
    //  DAILY MESSAGE
    // ============================

    function setupDailyMessage() {
        if (CONFIG.dailyMessage && CONFIG.dailyMessage.trim().length > 0) {
            var section = document.getElementById('message-section');
            var msgEl = document.getElementById('daily-message');
            msgEl.textContent = CONFIG.dailyMessage;
            section.classList.remove('hidden');
        }
    }

    // ============================
    //  REFRESH BUTTON
    // ============================

    function setupRefreshButton() {
        var btn = document.getElementById('refresh-btn');
        if (btn) {
            btn.addEventListener('click', function () { location.reload(); });
        }
    }

    // ============================
    //  CLOCK & DATE
    // ============================

    function startClock() {
        updateClock();
        setInterval(updateClock, 1000);
    }

    function updateClock() {
        try {
            var now = new Date();

            // --- Time ---
            var timeParts = getLocalTimeParts(now);
            var displayTime = formatTimeForDisplay(timeParts.raw);
            document.getElementById('current-time').textContent = displayTime;

            // --- Day ---
            var dateParts = getLocalDateParts(now);
            if (dateParts.dayIndex >= 0) {
                document.getElementById('day-name').textContent = ARABIC_DAYS[dateParts.dayIndex];
            }

            // --- Gregorian date with correct month naming ---
            var monthName = getMonthName(dateParts.month - 1); // month is 1-indexed
            var gregStr = dateParts.day + ' ' + monthName + ' ' + dateParts.year;
            document.getElementById('gregorian-date').textContent = gregStr;

            // --- Hijri date ---
            if (hijriDateStr) {
                document.getElementById('hijri-date').textContent = hijriDateStr;
            } else {
                try {
                    var hijri = now.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: CONFIG.timezone
                    });
                    document.getElementById('hijri-date').textContent = hijri;
                } catch (e) {
                    document.getElementById('hijri-date').textContent = '---';
                }
            }

            // Update countdown if we have prayer data
            if (prayerTimesData) {
                updateCountdown();
                updateIqamaCountdown();
            }

        } catch (e) {
            console.error('Clock update error:', e);
        }
    }

    // ============================
    //  PRAYER TIMES (Aladhan API)
    // ============================

    function fetchPrayerTimes() {
        var now = new Date();
        var dateStr = formatDateForApi(now);
        var url = 'https://api.aladhan.com/v1/timings/' + dateStr
            + '?latitude=' + CONFIG.latitude
            + '&longitude=' + CONFIG.longitude
            + '&method=' + CONFIG.calculationMethod
            + '&timezonestring=' + encodeURIComponent(CONFIG.timezone);

        fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (data.code === 200 && data.data) {
                    var timings = data.data.timings;

                    prayerTimesData = {};
                    for (var i = 0; i < PRAYERS.length; i++) {
                        var prayer = PRAYERS[i];
                        var time = timings[prayer.key];
                        if (!time) continue;
                        // Remove timezone info like " (EET)"
                        time = time.replace(/\s*\(.*\)/, '');
                        // Apply adjustment
                        var adj = (CONFIG.adjustments && CONFIG.adjustments[prayer.key]) || 0;
                        prayerTimesData[prayer.key] = adjustTime(time, adj);
                    }

                    // Calculate Imsak time
                    var imsakAdj = (typeof CONFIG.imsakAdjustment === 'number') ? CONFIG.imsakAdjustment : -10;
                    imsakTime = adjustTime(prayerTimesData['Fajr'], imsakAdj);

                    // Hijri date
                    if (data.data.date && data.data.date.hijri) {
                        var h = data.data.date.hijri;
                        hijriDateStr = h.day + ' ' + h.month.ar + ' ' + h.year;
                    }

                    lastNextIdx = -1; // force re-render
                    renderPrayerCards();
                    updateCountdown();
                } else {
                    showPrayerError();
                }
            })
            .catch(function (err) {
                console.error('Error fetching prayer times:', err);
                showPrayerError();
            });
    }

    var retryTimer = null;

    function showPrayerError() {
        var grid = document.getElementById('prayer-grid');
        if (grid) {
            grid.innerHTML = '';
            var errorDiv = document.createElement('div');
            errorDiv.className = 'prayer-error';

            var iconSpan = document.createElement('span');
            iconSpan.className = 'prayer-error-icon';
            iconSpan.textContent = '⚠️';

            var textSpan = document.createElement('span');
            textSpan.className = 'prayer-error-text';
            textSpan.textContent = 'تعذّر جلب مواقيت الصلاة';

            var subSpan = document.createElement('span');
            subSpan.className = 'prayer-error-sub';
            subSpan.textContent = 'يرجى التحقق من اتصال الإنترنت — إعادة المحاولة تلقائياً كل 30 ثانية...';

            var btn = document.createElement('button');
            btn.className = 'prayer-error-btn';
            btn.textContent = 'إعادة المحاولة الآن';
            btn.addEventListener('click', function () { location.reload(); });

            errorDiv.appendChild(iconSpan);
            errorDiv.appendChild(textSpan);
            errorDiv.appendChild(subSpan);
            errorDiv.appendChild(btn);
            grid.appendChild(errorDiv);
        }
        var countdown = document.getElementById('countdown-bar');
        if (countdown) {
            countdown.style.display = 'none';
        }
        var iqamaBar = document.getElementById('iqama-bar');
        if (iqamaBar) {
            iqamaBar.classList.add('hidden');
        }

        // Auto-retry every 30 seconds
        if (!retryTimer) {
            retryTimer = setInterval(function () {
                fetchPrayerTimesRetry();
            }, 30000);
        }
    }

    function fetchPrayerTimesRetry() {
        var now = new Date();
        var dateStr = formatDateForApi(now);
        var url = 'https://api.aladhan.com/v1/timings/' + dateStr
            + '?latitude=' + CONFIG.latitude
            + '&longitude=' + CONFIG.longitude
            + '&method=' + CONFIG.calculationMethod
            + '&timezonestring=' + encodeURIComponent(CONFIG.timezone);

        fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (data.code === 200 && data.data) {
                    // Success — clear retry timer
                    if (retryTimer) {
                        clearInterval(retryTimer);
                        retryTimer = null;
                    }
                    // Restore countdown bar
                    var countdown = document.getElementById('countdown-bar');
                    if (countdown) countdown.style.display = '';

                    // Process data (same as fetchPrayerTimes)
                    var timings = data.data.timings;
                    prayerTimesData = {};
                    for (var i = 0; i < PRAYERS.length; i++) {
                        var prayer = PRAYERS[i];
                        var time = timings[prayer.key];
                        if (!time) continue;
                        time = time.replace(/\s*\(.*\)/, '');
                        var adj = (CONFIG.adjustments && CONFIG.adjustments[prayer.key]) || 0;
                        prayerTimesData[prayer.key] = adjustTime(time, adj);
                    }
                    var imsakAdj = (typeof CONFIG.imsakAdjustment === 'number') ? CONFIG.imsakAdjustment : -10;
                    imsakTime = adjustTime(prayerTimesData['Fajr'], imsakAdj);
                    if (data.data.date && data.data.date.hijri) {
                        var h = data.data.date.hijri;
                        hijriDateStr = h.day + ' ' + h.month.ar + ' ' + h.year;
                    }
                    lastNextIdx = -1;
                    renderPrayerCards();
                    updateCountdown();
                }
            })
            .catch(function (err) {
                console.warn('Retry failed, will try again in 30s:', err);
            });
    }

    function formatDateForApi(date) {
        var dateParts = getLocalDateParts(date);
        return pad(dateParts.day) + '-' + pad(dateParts.month) + '-' + dateParts.year;
    }

    function adjustTime(timeStr, minutes) {
        var parts = timeStr.split(':');
        var h = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10);
        var totalMin = h * 60 + m + minutes;
        totalMin = ((totalMin % 1440) + 1440) % 1440;
        var newH = Math.floor(totalMin / 60);
        var newM = totalMin % 60;
        return pad(newH) + ':' + pad(newM);
    }

    function pad(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    function timeToMinutes(timeStr) {
        var parts = timeStr.split(':');
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    function getCurrentMinutes() {
        var now = new Date();
        var tp = getLocalTimeParts(now);
        return tp.hours * 60 + tp.minutes + tp.seconds / 60;
    }

    // ============================
    //  RENDER PRAYER CARDS
    // ============================

    function renderPrayerCards() {
        var grid = document.getElementById('prayer-grid');
        if (!grid || !prayerTimesData) return;
        grid.innerHTML = '';

        var indices = getCurrentAndNextPrayer();
        var currentIdx = indices.currentIdx;
        var nextIdx = indices.nextIdx;

        for (var i = 0; i < PRAYERS.length; i++) {
            var prayer = PRAYERS[i];
            var card = document.createElement('div');
            card.className = 'prayer-card';
            card.id = 'prayer-' + prayer.key;

            if (i === nextIdx) {
                card.classList.add('next-prayer');
            } else if (i === currentIdx) {
                card.classList.add('current-prayer');
            }

            // Badge
            if (i === nextIdx || i === currentIdx) {
                var badge = document.createElement('span');
                badge.className = 'prayer-badge';
                badge.textContent = (i === nextIdx) ? 'التالية' : 'الحالية';
                card.appendChild(badge);
            }

            // Icon
            var iconSpan = document.createElement('span');
            iconSpan.className = 'prayer-icon';
            iconSpan.textContent = prayer.icon;
            card.appendChild(iconSpan);

            // Name
            var nameSpan = document.createElement('span');
            nameSpan.className = 'prayer-name';
            nameSpan.textContent = prayer.nameAr;
            card.appendChild(nameSpan);

            // Time
            var timeSpan = document.createElement('span');
            timeSpan.className = 'prayer-time';
            timeSpan.textContent = formatTimeForDisplay(prayerTimesData[prayer.key]);
            card.appendChild(timeSpan);

            // Imsak badge (Fajr only)
            if (prayer.key === 'Fajr' && imsakTime) {
                var imsakDiv = document.createElement('div');
                imsakDiv.className = 'imsak-badge';
                var imsakLabel = document.createElement('span');
                imsakLabel.textContent = 'الإمساك';
                var imsakTimeSpan = document.createElement('span');
                imsakTimeSpan.className = 'imsak-time';
                imsakTimeSpan.textContent = formatTimeForDisplay(imsakTime);
                imsakDiv.appendChild(imsakLabel);
                imsakDiv.appendChild(imsakTimeSpan);
                card.appendChild(imsakDiv);
            }

            grid.appendChild(card);
        }
    }

    function getCurrentAndNextPrayer() {
        var currentMin = getCurrentMinutes();
        var nextIdx = -1;
        var currentIdx = -1;

        // Skip Sunrise (index 1) — it's not a prayer
        for (var i = 0; i < PRAYERS.length; i++) {
            if (PRAYERS[i].key === 'Sunrise') continue;
            var prayerMin = timeToMinutes(prayerTimesData[PRAYERS[i].key]);
            if (prayerMin > currentMin) {
                nextIdx = i;
                break;
            }
        }

        if (nextIdx === -1) {
            nextIdx = 0; // Fajr
            currentIdx = PRAYERS.length - 1; // Isha
        } else {
            // Find previous actual prayer (skip Sunrise)
            currentIdx = nextIdx - 1;
            if (currentIdx === 1) currentIdx = 0; // skip Sunrise, go to Fajr
            if (currentIdx < 0) currentIdx = PRAYERS.length - 1;
        }

        return { currentIdx: currentIdx, nextIdx: nextIdx };
    }

    // ============================
    //  COUNTDOWN
    // ============================

    function updateCountdown() {
        if (!prayerTimesData) return;

        var indices = getCurrentAndNextPrayer();
        var nextIdx = indices.nextIdx;
        var nextPrayer = PRAYERS[nextIdx];
        var nextMin = timeToMinutes(prayerTimesData[nextPrayer.key]);
        var currentMin = getCurrentMinutes();

        var diffMin = nextMin - currentMin;
        if (diffMin < 0) diffMin += 1440;

        var totalSeconds = Math.floor(diffMin * 60);
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        var timerStr = pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
        document.getElementById('countdown-timer').textContent = timerStr;

        // Alert animation when ≤ 60 seconds remain
        var countdownBar = document.getElementById('countdown-bar');
        var nextCard = document.getElementById('prayer-' + nextPrayer.key);

        if (totalSeconds <= 60 && totalSeconds > 0) {
            if (countdownBar) countdownBar.classList.add('prayer-alert');
            if (nextCard) nextCard.classList.add('prayer-alert');
        } else {
            if (countdownBar) countdownBar.classList.remove('prayer-alert');
            if (nextCard) nextCard.classList.remove('prayer-alert');
        }

        // Re-render only if prayer index changed
        if (nextIdx !== lastNextIdx) {
            // Play adhan sound on prayer transition (not on initial load)
            if (lastNextIdx !== -1) {
                var currentPrayerIdx = indices.currentIdx;
                var soundList = [];

                if (PRAYERS[currentPrayerIdx] && PRAYERS[currentPrayerIdx].key === 'Fajr') {
                    soundList = CONFIG.fajrAdhanSounds || [];
                } else {
                    soundList = CONFIG.adhanSounds || [];
                }

                if (soundList.length > 0) {
                    playRandomAdhan(soundList);
                }
            }
            lastNextIdx = nextIdx;
            iqamaPlayed = false; // Reset iqama flag on prayer transition
            renderPrayerCards();
        }
    }

    // Shuffle array (Fisher-Yates)
    function shuffleArray(arr) {
        var a = arr.slice(); // copy
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
        }
        return a;
    }

    function isAudioPlaying() {
        return currentAudio && !currentAudio.paused && !currentAudio.ended;
    }

    // Pick a random sound from the list and try to play it.
    // If it fails (file not found), try the next one.
    function playRandomAdhan(list) {
        if (!list || list.length === 0) return;

        var shuffled = shuffleArray(list);
        tryPlayFromList(shuffled, 0);
    }

    function tryPlayFromList(files, index) {
        if (index >= files.length) return; // all files failed, stay silent

        var file = files[index];

        if (!audioUnlocked) {
            // Audio not yet unlocked — queue and pulse banner
            pendingSound = file;
            var banner = document.getElementById('audio-unlock-banner');
            if (banner) banner.classList.add('audio-unlock-pulse');
            console.warn('Audio not unlocked yet. Sound queued:', file);
            return;
        }

        try {
            var audio = new Audio(file);

            audio.addEventListener('error', function () {
                console.warn('Sound file not found, trying next:', file);
                if (currentAudio === audio) currentAudio = null;
                tryPlayFromList(files, index + 1);
            });

            audio.addEventListener('ended', function () {
                if (currentAudio === audio) currentAudio = null;
            });

            currentAudio = audio;
            audio.play().catch(function (err) {
                console.warn('Audio play failed for:', file, err);
                if (currentAudio === audio) currentAudio = null;
                tryPlayFromList(files, index + 1);
            });
        } catch (e) {
            console.error('Audio creation error:', e);
            tryPlayFromList(files, index + 1);
        }
    }

    function playSound(file) {
        if (!audioUnlocked) {
            // Audio not yet unlocked — queue the sound and pulse the banner
            pendingSound = file;
            var banner = document.getElementById('audio-unlock-banner');
            if (banner) banner.classList.add('audio-unlock-pulse');
            console.warn('Audio not unlocked yet. Sound queued:', file);
            return;
        }

        try {
            var audio = new Audio(file);

            audio.addEventListener('ended', function () {
                if (currentAudio === audio) currentAudio = null;
            });

            currentAudio = audio;
            audio.play().catch(function (err) {
                console.warn('Audio play failed:', err);
                if (currentAudio === audio) currentAudio = null;
            });
        } catch (e) {
            console.error('Audio creation error:', e);
        }
    }

    // ============================
    //  IQAMA COUNTDOWN
    // ============================

    function updateIqamaCountdown() {
        if (!prayerTimesData) return;

        var iqamaBar = document.getElementById('iqama-bar');
        var iqamaTimerEl = document.getElementById('iqama-timer');
        if (!iqamaBar || !iqamaTimerEl) return;

        var offsets = CONFIG.iqamaOffsets || {};
        var indices = getCurrentAndNextPrayer();
        var currentIdx = indices.currentIdx;
        var currentPrayer = PRAYERS[currentIdx];

        // Skip Sunrise — it's not a prayer
        if (!currentPrayer || currentPrayer.key === 'Sunrise') {
            iqamaBar.classList.add('hidden');
            return;
        }

        var prayerKey = currentPrayer.key;
        var offset = offsets[prayerKey];

        // If no offset defined or offset is 0, hide the bar
        if (!offset || offset <= 0) {
            iqamaBar.classList.add('hidden');
            return;
        }

        var prayerMin = timeToMinutes(prayerTimesData[prayerKey]);
        var iqamaMin = prayerMin + offset;
        var currentMin = getCurrentMinutes();

        // Handle wrap-around at midnight
        var diffFromPrayer = currentMin - prayerMin;
        if (diffFromPrayer < 0) diffFromPrayer += 1440;

        var diffToIqama = iqamaMin - currentMin;
        if (diffToIqama < 0) diffToIqama += 1440;

        // Only show if we are between prayer time and iqama time
        // i.e. diffFromPrayer >= 0 and diffFromPrayer < offset
        if (diffFromPrayer >= 0 && diffFromPrayer < offset) {
            // Still counting down to iqama
            var totalSeconds = Math.max(0, Math.floor(diffToIqama * 60));

            if (totalSeconds > 0) {
                var mins = Math.floor(totalSeconds / 60);
                var secs = totalSeconds % 60;
                iqamaTimerEl.textContent = pad(mins) + ':' + pad(secs);

                iqamaBar.classList.remove('hidden');

                // Alert animation in the last 60 seconds
                if (totalSeconds <= 60) {
                    iqamaBar.classList.add('iqama-alert');
                } else {
                    iqamaBar.classList.remove('iqama-alert');
                }
            } else {
                // Time is up — hide bar and play sound
                iqamaBar.classList.add('hidden');
                iqamaBar.classList.remove('iqama-alert');

                if (!iqamaPlayed) {
                    iqamaPlayed = true;
                    // Skip iqama sound if adhan is still playing (adhan has priority)
                    if (!isAudioPlaying()) {
                        var iqamaSounds = CONFIG.iqamaSounds || [];
                        if (iqamaSounds.length > 0) {
                            playRandomAdhan(iqamaSounds);
                        }
                    }
                }
            }
        } else {
            // Not in iqama countdown period
            iqamaBar.classList.add('hidden');
            iqamaBar.classList.remove('iqama-alert');
        }
    }

    // ============================
    //  WEATHER (Open-Meteo API — free, no key, no limits)
    // ============================

    // WMO Weather Code to Arabic description + emoji
    var WMO_CODES = {
        0: { desc: 'صافي', icon: '☀️' },
        1: { desc: 'صافي تقريباً', icon: '🌤️' },
        2: { desc: 'غائم جزئياً', icon: '⛅' },
        3: { desc: 'غائم', icon: '☁️' },
        45: { desc: 'ضباب', icon: '🌫️' },
        48: { desc: 'ضباب متجمد', icon: '🌫️' },
        51: { desc: 'رذاذ خفيف', icon: '🌦️' },
        53: { desc: 'رذاذ معتدل', icon: '🌦️' },
        55: { desc: 'رذاذ كثيف', icon: '🌧️' },
        61: { desc: 'مطر خفيف', icon: '🌦️' },
        63: { desc: 'مطر معتدل', icon: '🌧️' },
        65: { desc: 'مطر غزير', icon: '🌧️' },
        66: { desc: 'مطر متجمد خفيف', icon: '🌧️' },
        67: { desc: 'مطر متجمد كثيف', icon: '🌧️' },
        71: { desc: 'ثلج خفيف', icon: '🌨️' },
        73: { desc: 'ثلج معتدل', icon: '🌨️' },
        75: { desc: 'ثلج كثيف', icon: '❄️' },
        77: { desc: 'حبيبات ثلجية', icon: '❄️' },
        80: { desc: 'زخات مطر خفيفة', icon: '🌦️' },
        81: { desc: 'زخات مطر معتدلة', icon: '🌧️' },
        82: { desc: 'زخات مطر عنيفة', icon: '🌧️' },
        85: { desc: 'زخات ثلج خفيفة', icon: '🌨️' },
        86: { desc: 'زخات ثلج كثيفة', icon: '❄️' },
        95: { desc: 'عاصفة رعدية', icon: '⛈️' },
        96: { desc: 'عاصفة رعدية مع بَرَد خفيف', icon: '⛈️' },
        99: { desc: 'عاصفة رعدية مع بَرَد كثيف', icon: '⛈️' }
    };

    var weatherRetryTimer = null;

    function fetchWeather() {
        var url = 'https://api.open-meteo.com/v1/forecast'
            + '?latitude=' + CONFIG.latitude
            + '&longitude=' + CONFIG.longitude
            + '&current=temperature_2m,weather_code'
            + '&timezone=' + encodeURIComponent(CONFIG.timezone);

        fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (data && data.current) {
                    var temp = Math.round(data.current.temperature_2m);
                    var code = data.current.weather_code;
                    var info = WMO_CODES[code] || { desc: 'غير محدد', icon: '🌡️' };

                    document.getElementById('weather-icon').textContent = info.icon;
                    document.getElementById('weather-temp').textContent = temp + '°C';
                    document.getElementById('weather-desc').textContent = info.desc;

                    // Success — clear retry timer if active
                    if (weatherRetryTimer) {
                        clearInterval(weatherRetryTimer);
                        weatherRetryTimer = null;
                    }
                } else {
                    scheduleWeatherRetry();
                }
            })
            .catch(function (err) {
                console.error('Error fetching weather:', err);
                document.getElementById('weather-desc').textContent = 'غير متاح — إعادة المحاولة...';
                scheduleWeatherRetry();
            });
    }

    function scheduleWeatherRetry() {
        if (!weatherRetryTimer) {
            weatherRetryTimer = setInterval(function () {
                fetchWeather();
            }, 30000);
        }
    }

    // ============================
    //  REFRESH
    // ============================

    function scheduleRefresh() {
        var now = new Date();
        var localStr = now.toLocaleString('en-US', { timeZone: CONFIG.timezone });
        var local = new Date(localStr);
        var midnight = new Date(local);
        midnight.setHours(24, 0, 5, 0);
        var msUntilMidnight = midnight.getTime() - local.getTime();

        setTimeout(function () {
            fetchPrayerTimes();
            fetchWeather();
            scheduleRefresh();
        }, msUntilMidnight);
    }

    // Refresh weather every 30 minutes
    setInterval(fetchWeather, 30 * 60 * 1000);

    // ============================
    //  START
    // ============================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            init();
            scheduleRefresh();
        });
    } else {
        init();
        scheduleRefresh();
    }

})();
