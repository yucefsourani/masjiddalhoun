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
        console.log('Dashboard initializing with config:', CONFIG.mosqueName);

        // Each section initializes independently
        try { setupBackground(); } catch (e) { console.error('Background error:', e); }
        try { setupHeader(); } catch (e) { console.error('Header error:', e); }
        try { setupDailyMessage(); } catch (e) { console.error('Message error:', e); }
        try { startClock(); } catch (e) { console.error('Clock error:', e); }

        // API calls (async, non-blocking)
        fetchPrayerTimes();
        fetchWeather();
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

        console.log('Fetching prayer times:', url);

        fetch(url)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                console.log('Prayer API response received');
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
            grid.innerHTML = '<div class="prayer-error">'
                + '<span class="prayer-error-icon">⚠️</span>'
                + '<span class="prayer-error-text">تعذّر جلب مواقيت الصلاة</span>'
                + '<span class="prayer-error-sub">يرجى التحقق من اتصال الإنترنت — إعادة المحاولة تلقائياً كل 30 ثانية...</span>'
                + '<button class="prayer-error-btn" onclick="location.reload()">إعادة المحاولة الآن</button>'
                + '</div>';
        }
        var countdown = document.getElementById('countdown-bar');
        if (countdown) {
            countdown.style.display = 'none';
        }

        // Auto-retry every 30 seconds
        if (!retryTimer) {
            retryTimer = setInterval(function () {
                console.log('Auto-retrying prayer times fetch...');
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
            .then(function (res) { return res.json(); })
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
                    console.log('Prayer times retry succeeded!');
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

            var badgeHtml = '';
            if (i === nextIdx) {
                badgeHtml = '<span class="prayer-badge">التالية</span>';
            } else if (i === currentIdx) {
                badgeHtml = '<span class="prayer-badge">الحالية</span>';
            }

            // Format prayer time for display (12h or 24h)
            var prayerDisplayTime = formatTimeForDisplay(prayerTimesData[prayer.key]);

            var imsakHtml = '';
            if (prayer.key === 'Fajr' && imsakTime) {
                var imsakDisplayTime = formatTimeForDisplay(imsakTime);
                imsakHtml = '<div class="imsak-badge">'
                    + '<span>الإمساك</span>'
                    + '<span class="imsak-time">' + imsakDisplayTime + '</span>'
                    + '</div>';
            }

            card.innerHTML = badgeHtml
                + '<span class="prayer-icon">' + prayer.icon + '</span>'
                + '<span class="prayer-name">' + prayer.nameAr + '</span>'
                + '<span class="prayer-time">' + prayerDisplayTime + '</span>'
                + imsakHtml;

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

    // Try to play a random adhan from the list, skip missing files silently
    function playRandomAdhan(list) {
        var shuffled = shuffleArray(list);
        tryNextSound(shuffled, 0);
    }

    function tryNextSound(files, index) {
        if (index >= files.length) return; // all failed, stay silent

        try {
            var audio = new Audio(files[index]);

            audio.addEventListener('canplaythrough', function () {
                audio.play().catch(function () { /* silent */ });
            });

            audio.addEventListener('error', function () {
                // File not found or can't load — try next
                tryNextSound(files, index + 1);
            });

            audio.load();
        } catch (e) {
            // Fallback: try next file
            tryNextSound(files, index + 1);
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

        console.log('Fetching weather:', url);

        fetch(url)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                console.log('Weather API response:', data);
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
                console.log('Auto-retrying weather fetch...');
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
