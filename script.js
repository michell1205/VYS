/**
 * Vardiya Yönetim Sistemi
 * Vanilla JS + LocalStorage
 */

const app = (function() {
    // --- State & Storage ---
    const state = {
        personnel: JSON.parse(localStorage.getItem('vys_personnel')) || [],
        leaves: JSON.parse(localStorage.getItem('vys_leaves')) || [],
        shifts: JSON.parse(localStorage.getItem('vys_shifts')) || [],
        logs: JSON.parse(localStorage.getItem('vys_logs')) || [],
        locations: JSON.parse(localStorage.getItem('vys_locations')) || ['Güvenlik A noktası', 'Güvenlik Doğu kapı', 'Güvenlik B Noktası'],
        settings: JSON.parse(localStorage.getItem('vys_settings')) || { monthlyHours: 180, animSpeed: '15s', shiftTimes: { morning: 7, evening: 15, night: 23 } }
    };
    let currentSort = { column: 'name', asc: true };
    let currentReportSort = { column: 'name', asc: true };

    const saveState = (key) => {
        localStorage.setItem(`vys_${key}`, JSON.stringify(state[key]));
    };

    const updatePersonnelLeaveStatus = () => {
        let updated = false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        state.personnel.forEach(p => {
            const hasActiveLeave = state.leaves.some(l => {
                if (l.personId !== p.id) return false;
                const start = new Date(l.startDate); start.setHours(0,0,0,0);
                const end = new Date(l.endDate); end.setHours(23,59,59,999);
                return today >= start && today <= end;
            });

            if (p.onLeave !== hasActiveLeave) {
                p.onLeave = hasActiveLeave;
                updated = true;
            }
        });
        if (updated) saveState('personnel');
    };

    // --- Utilities ---
    const generateId = () => '_' + Math.random().toString(36).substr(2, 9);
    
    const formatDate = (dateString) => {
        const options = { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' };
        return new Date(dateString).toLocaleDateString('tr-TR', options);
    };

    const getLocationBadge = (locName) => {
        const name = locName || 'Genel';
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash) % 360;
        return `<span style="background-color: hsla(${hue}, 70%, 50%, 0.15); color: var(--text-main); border: 1px solid hsla(${hue}, 70%, 50%, 0.4); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; margin: 2px; max-width: 100%; overflow: hidden;"><i class="fas fa-map-marker-alt" style="color: hsl(${hue}, 70%, 50%); flex-shrink: 0;"></i> <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span></span>`;
    };

    const logAction = (type, description) => {
        state.logs.unshift({ id: generateId(), date: new Date().toISOString(), type, description });
        if(state.logs.length > 100) state.logs.pop(); // Keep last 100
        saveState('logs');
        renderLogs();
    };

    const playNotificationSound = (type = 'success') => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.type = 'sine'; // Çan hissi için en saf ve titreşimli dalga tipi

            let freq = 1046.50; // Başarılı: İnce ve parlak çan (C6)
            let duration = 1.2; // Çınlama süresi (saniye)

            if (type === 'error') {
                freq = 349.23; // Hata: Kalın ve tok çan (F4)
                duration = 0.8;
            } else if (type === 'warning') {
                freq = 659.25; // Uyarı: Orta ton çan (E5)
                duration = 1.0;
            }

            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            // Çan Efekti Envelope (Hızlı vuruş, yavaşça sönümlenerek çınlama)
            gainNode.gain.setValueAtTime(0, ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02); // Tokmak vuruşu
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration); // Havada sönümlenme

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) { } // İlk yüklemedeki tarayıcı sessize alma (autoplay) kurallarını atla
    };

    const showToast = (message, type = 'success') => {
        playNotificationSound(type);
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> 
            <span style="flex: 1;">${message}</span>
            <div class="toast-progress"></div>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };

    const staggerAnimation = (selector, animName = 'slideUpStagger') => {
        document.querySelectorAll(selector).forEach((el, index) => {
            el.style.opacity = '0';
            el.style.animation = `${animName} 0.4s ${index * 0.07}s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`;
        });
    };

    const animateCounter = (el, endVal, duration = 1000) => {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart effect
            el.innerText = Math.floor(easeProgress * endVal);
            if (progress < 1) window.requestAnimationFrame(step);
            else el.innerText = endVal;
        };
        window.requestAnimationFrame(step);
    };

    const apply3DParallax = (selector) => {
        document.querySelectorAll(selector).forEach(card => {
            if (card.dataset.parallaxBound) return; // Aynı karta tekrar atanmasını engelle
            card.dataset.parallaxBound = "true";

            card.addEventListener('mousemove', (e) => {
                if (window.innerWidth <= 768) return; // Mobilde devre dışı bırak
                
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -5; // X ekseni eğimi (Maks 5 derece)
                const rotateY = ((x - centerX) / centerX) * 5;  // Y ekseni eğimi (Maks 5 derece)

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px) scale(1.02)`;
                card.style.transition = 'transform 0.1s ease-out';
            });
            
            card.addEventListener('mouseleave', () => {
                if (window.innerWidth <= 768) return;
                card.style.transform = ''; // CSS varsayılanına yumuşak dönüş yap
                card.style.transition = 'transform 0.5s ease-out';
            });
        });
    };

    // --- Navigation & Theme ---
    const initUI = () => {
        const updateIndicator = () => {
            const activeItem = document.querySelector('#navMenu .nav-item.active');
            const indicator = document.getElementById('navIndicator');
            if (activeItem && indicator && window.innerWidth > 768) {
                const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
                indicator.style.width = `${activeItem.offsetWidth}px`;
                indicator.style.left = `${activeItem.offsetLeft}px`;
                indicator.style.backgroundColor = themeColor;
                indicator.style.opacity = '1';
                indicator.style.transition = 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
            } else if (indicator) {
                indicator.style.opacity = '0';
            }
        };
        window.addEventListener('resize', updateIndicator);

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!item.dataset.target) return; // Menü butonu kontrolü
                e.preventDefault();
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
                
                const targetId = item.dataset.target;

                // Hem sidebar hem alt barda eşzamanlı aktifliği sağla
                document.querySelectorAll(`.nav-item[data-target="${targetId}"]`).forEach(n => n.classList.add('active'));
                
                document.getElementById(targetId).classList.add('active');

                updateDashboard(); // Refresh dash
                updateIndicator();

                // Sayfa değiştiğinde kaydırmayı ve ilerleme çubuğunu sıfırla
                const mainContent = document.querySelector('.main-content');
                const progressBar = document.getElementById('scrollProgress');
                if (mainContent) mainContent.scrollTop = 0;
                if (progressBar) progressBar.style.width = '0%';

                // Kullanıcının bulunduğu son sekmeyi hafızaya al
                localStorage.setItem('vys_active_tab', targetId);

                // Close sidebar on mobile after clicking a link
                const sidebar = document.getElementById('navMenu');
                const sidebarOverlay = document.getElementById('sidebarOverlay');
                if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    sidebarOverlay.classList.remove('show');
                }
            });
        });

        // Mobile Menu Toggle
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const sidebar = document.getElementById('navMenu');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if(mobileMenuBtn && sidebar && sidebarOverlay) {
            const toggleMenu = () => {
                sidebar.classList.toggle('open');
                sidebarOverlay.classList.toggle('show');
            };
            mobileMenuBtn.addEventListener('click', toggleMenu);
            sidebarOverlay.addEventListener('click', toggleMenu);
        }

        // Theme Selection
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        const themeDropdown = document.getElementById('themeDropdown');
        const savedTheme = localStorage.getItem('vys_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);

        const updateChartsTheme = () => {
            setTimeout(() => {
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
                const newColor = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim();
                const newPrimary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
                if (window.occupancyChartInstance) {
                    window.occupancyChartInstance.data.datasets[0].backgroundColor = newPrimary;
                    window.occupancyChartInstance.options.scales.x.ticks.color = newColor;
                    window.occupancyChartInstance.options.scales.y.ticks.color = newColor;
                    window.occupancyChartInstance.update();
                }

                // Arka plan animasyon şekillerinin rengini yeni temaya göre güncelle
                document.querySelectorAll('.bg-animation .shape').forEach(shape => {
                    shape.style.backgroundColor = newPrimary;
                });
                // Temaya özel animasyon ayarları
                const bgConfigs = {
                    light: { count: 3, speed: '15s' },
                    dark: { count: 2, speed: '25s' },
                    ocean: { count: 6, speed: '8s' },
                    nature: { count: 4, speed: '18s' },
                    sunset: { count: 3, speed: '12s' },
                    coffee: { count: 2, speed: '30s' }
                };
                const config = bgConfigs[currentTheme] || bgConfigs.light;

                // Hızı ve Şekil Sayısını Güncelle
                const bgContainer = document.querySelector('.bg-animation');
                if (bgContainer && state.settings.animSpeed !== '0s') {
                    document.documentElement.style.setProperty('--bg-anim-speed', config.speed);
                    bgContainer.innerHTML = Array.from({ length: config.count }, (_, i) => 
                        `<div class="shape shape-${(i % 3) + 1}" style="background-color: ${newPrimary}"></div>`
                    ).join('');
                }

                updateIndicator();
            }, 400); // Wait for CSS transition to finish
        };

        themeToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            themeDropdown.classList.toggle('show');
        });

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.theme-switcher')) {
                themeDropdown.classList.remove('show');
            }
        });

        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                const newTheme = option.dataset.theme;
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('vys_theme', newTheme);
                updateChartsTheme();
                themeDropdown.classList.remove('show');
            });
        });

        // Apply Initial Animation Speed
        if (state.settings.animSpeed) {
            document.documentElement.style.setProperty('--bg-anim-speed', state.settings.animSpeed);
            if (state.settings.animSpeed === '0s') document.querySelector('.bg-animation').style.display = 'none';
        }

        // Forms
        document.getElementById('personnelForm').addEventListener('submit', handlePersonnelSubmit);
        document.getElementById('shiftForm').addEventListener('submit', handleShiftGenerate);
        document.getElementById('leaveForm').addEventListener('submit', handleLeaveSubmit);
        document.getElementById('manualAssignForm').addEventListener('submit', handleManualAssignSubmit);
        document.getElementById('batchLeaveForm').addEventListener('submit', handleBatchLeaveSubmit);
        
        // Select All Checkbox
        const selectAllPersonnel = document.getElementById('selectAllPersonnel');
        if(selectAllPersonnel) {
            selectAllPersonnel.addEventListener('change', (e) => {
                document.querySelectorAll('.personnel-cb').forEach(cb => cb.checked = e.target.checked);
                updateBatchActions();
            });
        }

        // Search
        document.getElementById('globalSearch').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            
            const filterElements = (containerSelector, itemSelector) => {
                const container = document.querySelector(containerSelector);
                if (!container) return;
                let hasVisible = false;
                const items = container.querySelectorAll(itemSelector);
                items.forEach(el => {
                    if (el.classList.contains('no-results')) return;
                    const isMatch = el.innerText.toLowerCase().includes(query);
                    el.style.display = isMatch ? '' : 'none';
                    if (isMatch) hasVisible = true;
                });
                const existingMsg = container.querySelector('.no-results');
                if (existingMsg) existingMsg.remove();
                if (!hasVisible && items.length > 0) {
                    const isTable = itemSelector === 'tr';
                    const wrapStart = isTable ? '<tr class="no-results"><td colspan="10" style="text-align: center; padding: 40px; color: var(--text-muted);">' : '<div class="no-results" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">';
                    const wrapEnd = isTable ? '</td></tr>' : '</div>';
                    container.insertAdjacentHTML('beforeend', `${wrapStart}<i class="fas fa-search" style="font-size: 2.5rem; display: block; margin-bottom: 15px; opacity: 0.3;"></i>"${e.target.value}" ile eşleşen kayıt bulunamadı.${wrapEnd}`);
                }
            };
            
            // Arama artık sadece Personel sekmesinde çalıştığı için, sadece personel tablosunu filtrele
            filterElements('#personnelTable tbody', 'tr');
        });

        // Sortable Headers Listener
        document.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const tableId = th.closest('table').id;
                const col = th.dataset.sort;
                
                if (tableId === 'personnelTable') {
                    if (currentSort.column === col) {
                        currentSort.asc = !currentSort.asc;
                    } else {
                        currentSort.column = col;
                        currentSort.asc = true;
                    }
                    document.querySelectorAll('#personnelTable th.sortable').forEach(el => el.classList.remove('asc', 'desc'));
                    th.classList.add(currentSort.asc ? 'asc' : 'desc');
                    renderPersonnel();
                } else if (tableId === 'reportsTable') {
                    if (currentReportSort.column === col) {
                        currentReportSort.asc = !currentReportSort.asc;
                    } else {
                        currentReportSort.column = col;
                        currentReportSort.asc = true;
                    }
                    document.querySelectorAll('#reportsTable th.sortable').forEach(el => el.classList.remove('asc', 'desc'));
                    th.classList.add(currentReportSort.asc ? 'asc' : 'desc');
                    renderReports();
                }
            });
        });

        // View Tabs (Weekly / Monthly)
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const view = tab.dataset.view;
                const container = document.getElementById('shiftCalendar');
                
                container.classList.remove('monthly-view', 'yearly-view');
                
                if (view === 'monthly') container.classList.add('monthly-view');
                else if (view === 'yearly') container.classList.add('yearly-view');
                
            });
        });

        // Leave Filter
        const leaveFilter = document.getElementById('leaveFilter');
        if(leaveFilter) leaveFilter.addEventListener('change', renderLeaves);

        // Personnel Filter
        const personnelFilter = document.getElementById('personnelFilter');
        if(personnelFilter) personnelFilter.addEventListener('change', renderPersonnel);

        // Report Month Filter
        const reportMonthFilter = document.getElementById('reportMonthFilter');
        if(reportMonthFilter) {
            reportMonthFilter.value = new Date().toISOString().slice(0, 7); // Default to current month (YYYY-MM)
            reportMonthFilter.addEventListener('change', renderReports);
        }

        // FAQ Accordion Toggle
        document.querySelectorAll('.faq-question').forEach(q => {
            q.addEventListener('click', () => {
                const item = q.parentElement;
                item.classList.toggle('active');
            });
        });

        // Excel Import Listener
        document.getElementById('importExcelInput').addEventListener('change', handleExcelImport);

        // Backup Import Listener
        document.getElementById('importBackupInput').addEventListener('change', handleBackupImport);

        // Sayfa yenilendiğinde en son kalınan sekmeyi geri yükle
        const savedTab = localStorage.getItem('vys_active_tab');
        if (savedTab) {
            const activeTabBtn = document.querySelector(`.nav-item[data-target="${savedTab}"]`);
            if (activeTabBtn) activeTabBtn.click(); // Sanal tıklama ile yönlendirmeyi tetikle
        } else {
            setTimeout(updateIndicator, 100);
        }

        // Okuma İlerleme Çubuğu Mantığı
        const mainContent = document.querySelector('.main-content');
        const progressBar = document.getElementById('scrollProgress');
        if (mainContent && progressBar) {
            mainContent.addEventListener('scroll', () => {
                const winScroll = mainContent.scrollTop;
                const height = mainContent.scrollHeight - mainContent.clientHeight;
                const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
                progressBar.style.width = scrolled + "%";
            });
        }
    };

    // --- Shift Countdown Timer ---
    const initShiftCountdown = () => {
        const nameEl = document.getElementById('activeShiftName');
        const timerEl = document.getElementById('shiftCountdown');
        const hourHand = document.getElementById('hourHand');
        const minHand = document.getElementById('minHand');
        const secondHand = document.getElementById('secondHand');
        if (!nameEl || !timerEl) return;

        const updateTimer = () => {
            const now = new Date();
            const h = now.getHours();
            
            const times = state.settings.shiftTimes || { morning: 7, evening: 15, night: 23 };
            let shiftName = '';
            let endH = 0;

            // Saat bazlı dilim hesaplama
            if (h >= times.morning && h < times.evening) {
                shiftName = `<i class="fas fa-sun" style="color: var(--warning);"></i> Sabah Vardiyası (${String(times.morning).padStart(2, '0')}:00 - ${String(times.evening).padStart(2, '0')}:00)`;
                endH = times.evening;
            } else if (h >= times.evening && h < times.night) {
                shiftName = `<i class="fas fa-cloud-sun" style="color: var(--danger);"></i> Akşam Vardiyası (${String(times.evening).padStart(2, '0')}:00 - ${String(times.night).padStart(2, '0')}:00)`;
                endH = times.night;
            } else {
                shiftName = `<i class="fas fa-moon" style="color: var(--primary);"></i> Gece Vardiyası (${String(times.night).padStart(2, '0')}:00 - ${String(times.morning).padStart(2, '0')}:00)`;
                endH = times.morning;
            }

            const end = new Date(now);
            if (endH === 24) end.setHours(23, 59, 59, 999);
            else end.setHours(endH, 0, 0, 0);

            let diff = end - now;
            if (endH === 24) diff += 1; // Tam hizalama payı

            const diffHours = Math.floor(diff / (1000 * 60 * 60));
            const diffMins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const diffSecs = Math.floor((diff % (1000 * 60)) / 1000);

            nameEl.innerHTML = shiftName;
            timerEl.innerText = `${String(diffHours).padStart(2, '0')}:${String(diffMins).padStart(2, '0')}:${String(diffSecs).padStart(2, '0')}`;

            // Analog Clock Logic
            const seconds = now.getSeconds();
            const mins = now.getMinutes();
            const hours = h % 12 || 12;
            
            const secondsDegrees = ((seconds / 60) * 360) + 90;
            const minsDegrees = ((mins / 60) * 360) + ((seconds/60)*6) + 90;
            const hoursDegrees = ((hours / 12) * 360) + ((mins/60)*30) + 90;
            
            if(secondHand) {
                secondHand.style.transform = `rotate(${secondsDegrees}deg)`;
                secondHand.style.transition = seconds === 0 ? 'none' : 'all 0.05s cubic-bezier(0.1, 2.7, 0.58, 1)';
            }
            if(minHand) {
                minHand.style.transform = `rotate(${minsDegrees}deg)`;
                minHand.style.transition = mins === 0 && seconds === 0 ? 'none' : 'all 0.05s cubic-bezier(0.1, 2.7, 0.58, 1)';
            }
            if(hourHand) hourHand.style.transform = `rotate(${hoursDegrees}deg)`;
        };
        updateTimer();
        setInterval(updateTimer, 1000);
    };

    // --- Modals ---
    const openModal = (id) => {
        if(id === 'personnelModal') document.getElementById('personnelForm').reset();
        if(id === 'leaveModal') {
            document.getElementById('leaveForm').reset();
            const pSelect = document.getElementById('l_person');
            pSelect.innerHTML = state.personnel.filter(p => p.isActive).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        }
        if(id === 'shiftModal') {
            const locContainer = document.getElementById('s_locations_container');
            locContainer.innerHTML = state.locations.map(loc => `
                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer; color: var(--text-main); font-size: 0.95rem;">
                    <input type="checkbox" name="s_locations" value="${loc}" checked> ${loc}
                </label>
            `).join('');
        }
        if(id === 'settingsModal') {
            renderLocations();
            document.getElementById('monthlyHoursInput').value = state.settings.monthlyHours;
            document.getElementById('animSpeedInput').value = state.settings.animSpeed || '15s';

            const times = state.settings.shiftTimes || { morning: 7, evening: 15, night: 23 };
            document.getElementById('morningStartInput').value = times.morning;
            document.getElementById('eveningStartInput').value = times.evening;
            document.getElementById('nightStartInput').value = times.night;
        }
        document.getElementById(id).classList.add('show');
    };
    const closeModal = (id) => document.getElementById(id).classList.remove('show');

    // --- Settings & Locations Logic ---
    const renderLocations = () => {
        const list = document.getElementById('locationsList');
        if(!list) return;
        list.innerHTML = state.locations.map((loc, index) => `
            <li class="location-item">
                <span>${loc}</span>
                <button onclick="app.deleteLocation(${index})" title="Sil"><i class="fas fa-trash"></i></button>
            </li>
        `).join('');
    };

    const addLocation = () => {
        const input = document.getElementById('newLocationInput');
        const val = input.value.trim();
        if(!val) return showToast('Lütfen bir nokta adı girin.', 'warning');
        if(state.locations.includes(val)) return showToast('Bu nokta zaten mevcut!', 'error');

        state.locations.push(val);
        saveState('locations');
        input.value = '';
        renderLocations();
        logAction('Ayarlar', `'${val}' noktası eklendi.`);
        showToast('Görev noktası eklendi.');
    };

    const deleteLocation = (index) => {
        const loc = state.locations[index];
        if(confirm(`'${loc}' noktasını silmek istediğinize emin misiniz?`)) {
            state.locations.splice(index, 1);
            saveState('locations');
            renderLocations();
            logAction('Ayarlar', `'${loc}' noktası silindi.`);
            showToast('Görev noktası silindi.', 'error');
        }
    };

    const saveGeneralSettings = () => {
        const hours = parseInt(document.getElementById('monthlyHoursInput').value);
        const animSpeed = document.getElementById('animSpeedInput').value;
        const mStart = parseInt(document.getElementById('morningStartInput').value);
        const eStart = parseInt(document.getElementById('eveningStartInput').value);
        const nStart = parseInt(document.getElementById('nightStartInput').value);
        
        if(isNaN(hours) || hours < 1) return showToast('Geçerli bir çalışma saati girin.', 'error');
        if(isNaN(mStart) || isNaN(eStart) || isNaN(nStart)) return showToast('Lütfen geçerli vardiya saatleri girin.', 'error');
        
        state.settings.monthlyHours = hours;
        state.settings.animSpeed = animSpeed;
        state.settings.shiftTimes = { morning: mStart, evening: eStart, night: nStart };

        document.documentElement.style.setProperty('--bg-anim-speed', animSpeed);
        const bgAnim = document.querySelector('.bg-animation');
        if(bgAnim) bgAnim.style.display = animSpeed === '0s' ? 'none' : 'block';
        
        saveState('settings');
        renderReports();
        logAction('Ayarlar', `Genel ayarlar güncellendi.`);
        showToast('Ayarlar başarıyla kaydedildi.');
    };

    // --- Backup & Restore Logic ---
    const exportBackup = () => {
        const dataStr = JSON.stringify(state, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `vardiyapro_yedek_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        logAction('Yedekleme', 'Sistem yedeği JSON olarak indirildi.');
        showToast('Yedekleme başarılı.');
    };

    const handleBackupImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const importedState = JSON.parse(evt.target.result);
                if (importedState.personnel && importedState.shifts) {
                    Object.keys(state).forEach(key => {
                        if(importedState[key]) state[key] = importedState[key];
                        saveState(key);
                    });
                    app.init(); // Uygulamayı yeni verilerle baştan başlat
                    logAction('Geri Yükleme', 'Sistem yedeği başarıyla geri yüklendi.');
                    showToast('Yedek başarıyla geri yüklendi!');
                    closeModal('settingsModal');
                } else showToast('Geçersiz yedek dosyası yapısı.', 'error');
            } catch (error) {
                showToast('Dosya okunurken hata oluştu.', 'error');
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    };

    const resetSystem = () => {
        if (confirm('Sistemi resetlemek istediğinizden emin misiniz? Tüm verileriniz kalıcı olarak silinecektir.')) {
            // Sadece bu uygulamaya ait olan local storage verilerini bul ve sil
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('vys_')) {
                    localStorage.removeItem(key);
                }
            });
            window.location.reload(); // Sayfayı sıfırlanmış haliyle yeniden başlat
        }
    };

    // --- Excel Import Logic ---
    const handleExcelImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(worksheet);

                let importedCount = 0;
                json.forEach(row => {
                    const name = row['Ad Soyad'] || row['Ad'] || row['Name'];
                    if (!name) return; // İsimsiz satırları geç

                    state.personnel.push({
                        id: generateId(),
                        name: name,
                        role: row['Görev'] || row['Görev Noktası'] || row['Role'] || 'Personel',
                        isJoker: String(row['Joker'] || '').toLowerCase() === 'evet' || String(row['Joker'] || '').toLowerCase() === 'true',
                        onLeave: String(row['İzinli'] || '').toLowerCase() === 'evet' || String(row['İzinli'] || '').toLowerCase() === 'true',
                        noWeekends: String(row['Hafta Sonu Çalışmaz'] || row['H.Sonu Yok'] || '').toLowerCase() === 'evet' || String(row['Hafta Sonu Çalışmaz'] || '').toLowerCase() === 'true',
                        isActive: row['Aktif'] !== undefined ? (String(row['Aktif']).toLowerCase() === 'evet' || String(row['Aktif']).toLowerCase() === 'true') : true
                    });
                    importedCount++;
                });

                if (importedCount > 0) {
                    saveState('personnel');
                    renderPersonnel();
                    logAction('İçe Aktarım', `${importedCount} personel Excel'den eklendi.`);
                    showToast(`${importedCount} personel başarıyla içe aktarıldı!`);
                } else {
                    showToast('Aktarılacak geçerli kayıt bulunamadı (Sütun adı: "Ad Soyad" olmalı).', 'warning');
                }
            } catch (error) {
                showToast('Excel dosyası okunurken hata oluştu!', 'error');
                console.error(error);
            }
            e.target.value = ''; // Inputu temizle
        };
        reader.readAsArrayBuffer(file);
    };

    const downloadExcelTemplate = () => {
        if (typeof XLSX === 'undefined') return showToast('Excel kütüphanesi yüklenemedi.', 'error');
        const templateData = [
            { 'Ad Soyad': 'Örnek Personel 1', 'Görev': 'Operatör', 'Joker': 'Hayır', 'İzinli': 'Hayır', 'Hafta Sonu Çalışmaz': 'Evet', 'Aktif': 'Evet' },
            { 'Ad Soyad': 'Örnek Personel 2', 'Görev': 'Mühendis', 'Joker': 'Evet', 'İzinli': 'Hayır', 'Hafta Sonu Çalışmaz': 'Hayır', 'Aktif': 'Evet' }
        ];
        
        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Personel_Sablonu");
        XLSX.writeFile(wb, "personel_sablon.xlsx");
        logAction('İndirme', 'Personel ekleme şablonu indirildi.');
    };

    // --- Personnel Logic ---
    const handlePersonnelSubmit = (e) => {
        e.preventDefault();
        const id = document.getElementById('p_id').value;
        const person = {
            name: document.getElementById('p_name').value,
            role: document.getElementById('p_role').value,
            isJoker: document.getElementById('p_joker').checked,
            onLeave: document.getElementById('p_leave').checked,
            isActive: document.getElementById('p_active').checked,
            noWeekends: document.getElementById('p_noweekend').checked
        };

        if (id) {
            const index = state.personnel.findIndex(p => p.id === id);
            state.personnel[index] = { ...state.personnel[index], ...person };
            logAction('Güncelleme', `${person.name} bilgileri güncellendi.`);
            showToast('Personel güncellendi.');
        } else {
            person.id = generateId();
            state.personnel.push(person);
            logAction('Ekleme', `${person.name} sisteme eklendi.`);
            showToast('Yeni personel eklendi.');
        }
        saveState('personnel');
        renderPersonnel();
        closeModal('personnelModal');
    };

    const deletePerson = (id) => {
        if(confirm('Bu personeli silmek istediğinize emin misiniz?')) {
            const person = state.personnel.find(p => p.id === id);
            state.personnel = state.personnel.filter(p => p.id !== id);
            logAction('Silme', `${person.name} sistemden silindi.`);
            saveState('personnel');
            renderPersonnel();
            showToast('Personel silindi.', 'error');
        }
    };

    const editPerson = (id) => {
        const p = state.personnel.find(x => x.id === id);
        document.getElementById('p_id').value = p.id;
        document.getElementById('p_name').value = p.name;
        document.getElementById('p_role').value = p.role;
        document.getElementById('p_joker').checked = p.isJoker;
        document.getElementById('p_leave').checked = p.onLeave;
        document.getElementById('p_noweekend').checked = p.noWeekends || false;
        document.getElementById('p_active').checked = p.isActive;
        document.getElementById('modalTitle').innerText = 'Personel Düzenle';
        openModal('personnelModal');
    };

    const showPersonnelDetails = (id) => {
        const person = state.personnel.find(p => p.id === id);
        if(!person) return;
        
        let filterMonth = document.getElementById('reportMonthFilter')?.value || new Date().toISOString().slice(0, 7);
        const threshold = state.settings.monthlyHours;
        
        let history = [];
        let monthTotalHours = 0;
        state.shifts.forEach(shift => {
            const isMatch = shift.date.startsWith(filterMonth);
            const addHist = (type) => {
                history.push({ date: shift.date, loc: shift.location, type });
                if (isMatch) monthTotalHours += 8;
            };
            if (shift.morning.some(p => p.id === id)) addHist('Sabah');
            if (shift.evening.some(p => p.id === id)) addHist('Akşam');
            if (shift.night.some(p => p.id === id)) addHist('Gece');
        });

        const overtime = Math.max(0, monthTotalHours - threshold);
        document.getElementById('detailModalTitle').innerText = `${person.name} - Detaylar`;
        
        const detailBody = document.getElementById('detailModalBody');
        detailBody.innerHTML = `
            <div class="stats-grid" style="grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <div class="stat-card" style="padding: 15px; background: rgba(var(--primary-rgb), 0.1);">
                    <div class="stat-details">
                        <h3 style="font-size: 0.8rem;">Aylık Toplam (${filterMonth})</h3>
                        <p style="font-size: 1.2rem;">${monthTotalHours} Saat</p>
                    </div>
                </div>
                <div class="stat-card" style="padding: 15px; background: ${overtime > 0 ? 'rgba(231, 76, 60, 0.1)' : 'rgba(var(--primary-rgb), 0.1)'};">
                    <div class="stat-details">
                        <h3 style="font-size: 0.8rem;">Fazla Mesai</h3>
                        <p style="font-size: 1.2rem; color: ${overtime > 0 ? 'var(--danger)' : 'var(--text-main)'};">${overtime} Saat</p>
                    </div>
                </div>
            </div>
            <h3 style="margin-bottom: 10px; font-size: 1rem; color: var(--primary);">Vardiya Geçmişi</h3>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead style="position: sticky; top: 0; background: var(--bg-card); z-index: 1;">
                        <tr>
                            <th style="padding: 10px; border-bottom: 1px solid var(--border-color);">Tarih</th>
                            <th style="padding: 10px; border-bottom: 1px solid var(--border-color);">Görev Noktası</th>
                            <th style="padding: 10px; border-bottom: 1px solid var(--border-color);">Vardiya Tipi</th>
                        </tr>
                    </thead>
                    <tbody id="personnelShiftHistory"></tbody>
                </table>
            </div>
        `;

        const tbody = document.getElementById('personnelShiftHistory');
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
        if (history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 15px;" class="text-muted">Kayıtlı vardiya bulunamadı.</td></tr>`;
        } else {
            history.forEach(h => {
                let typeColor = h.type === 'Sabah' ? 'var(--warning)' : h.type === 'Akşam' ? 'var(--danger)' : 'var(--primary)';
                tbody.innerHTML += `<tr>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-color);">${formatDate(h.date)}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-color);">${h.loc || 'Genel'}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-color);"><strong><span style="color:${typeColor}">${h.type}</span></strong></td>
                </tr>`;
            });
        }
        openModal('personnelDetailModal');
    };

    const renderPersonnel = () => {
        const tbody = document.querySelector('#personnelTable tbody');
        tbody.innerHTML = '';
        const filterVal = document.getElementById('personnelFilter') ? document.getElementById('personnelFilter').value : 'all';

        const todayStr = new Date().toISOString().split('T')[0];
        const todayShifts = state.shifts.filter(s => s.date === todayStr);

        let renderList = [];

        state.personnel.forEach(p => {
            if (filterVal === 'active' && !p.isActive) return;
            if (filterVal === 'passive' && p.isActive) return;

            const statusText = p.isActive ? (p.onLeave ? 'İzinli' : 'Aktif') : 'Pasif';
            const statusHtml = p.isActive ? (p.onLeave ? '<span class="badge bg-warning">İzinli</span>' : '<span class="badge bg-success">Aktif</span>') : '<span class="badge bg-danger">Pasif</span>';

            let currentShiftHtml = '<span class="text-muted">-</span>';
            let currentShiftText = '-';

            if (p.isActive && !p.onLeave) {
                for (const shift of todayShifts) {
                    if (shift.morning.some(sp => sp.id === p.id)) {
                        currentShiftHtml = `${getLocationBadge(shift.location)} <span class="badge" style="background: rgba(241, 196, 15, 0.1); color: #d4ac0d;"><i class="fas fa-sun"></i> Sabah</span>`;
                        currentShiftText = `${shift.location} Sabah`;
                        break;
                    }
                    if (shift.evening.some(sp => sp.id === p.id)) {
                        currentShiftHtml = `${getLocationBadge(shift.location)} <span class="badge" style="background: rgba(230, 126, 34, 0.1); color: #e67e22;"><i class="fas fa-cloud-sun"></i> Akşam</span>`;
                        currentShiftText = `${shift.location} Akşam`;
                        break;
                    }
                    if (shift.night.some(sp => sp.id === p.id)) {
                        currentShiftHtml = `${getLocationBadge(shift.location)} <span class="badge" style="background: rgba(52, 73, 94, 0.1); color: #34495e;"><i class="fas fa-moon"></i> Gece</span>`;
                        currentShiftText = `${shift.location} Gece`;
                        break;
                    }
                }
            }

            renderList.push({ ...p, statusText, statusHtml, currentShiftText, currentShiftHtml });
        });

        // Apply Sorting
        renderList.sort((a, b) => {
            let valA = a[currentSort.column] || '';
            let valB = b[currentSort.column] || '';
            
            if (currentSort.column === 'status') { valA = a.statusText; valB = b.statusText; }
            else if (currentSort.column === 'shift') { valA = a.currentShiftText; valB = b.currentShiftText; }
            
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            
            if (valA < valB) return currentSort.asc ? -1 : 1;
            if (valA > valB) return currentSort.asc ? 1 : -1;
            return 0;
        });

        renderList.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td style="text-align: center;"><input type="checkbox" class="personnel-cb" value="${p.id}"></td>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.role}</td>
                    <td>${p.currentShiftHtml}</td>
                    <td>${p.statusHtml}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="app.showPersonnelDetails('${p.id}')" title="Detaylar"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-sm btn-outline" onclick="app.editPerson('${p.id}')" title="Düzenle"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="app.deletePerson('${p.id}')" title="Sil"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });

        document.querySelectorAll('.personnel-cb').forEach(cb => {
            cb.addEventListener('change', updateBatchActions);
        });
        const selectAllBtn = document.getElementById('selectAllPersonnel');
        if(selectAllBtn) selectAllBtn.checked = false;
        updateBatchActions();

        updateDashboard();
        staggerAnimation('#personnelTable tbody tr');
    };

    // --- Leave Logic ---
    const handleLeaveSubmit = (e) => {
        e.preventDefault();
        const start = new Date(document.getElementById('l_start').value);
        const end = new Date(document.getElementById('l_end').value);
        if (start > end) return showToast('Bitiş tarihi başlangıçtan önce olamaz!', 'error');

        const leave = {
            id: generateId(),
            personId: document.getElementById('l_person').value,
            startDate: document.getElementById('l_start').value,
            endDate: document.getElementById('l_end').value,
            reason: document.getElementById('l_reason').value
        };
        
        const person = state.personnel.find(p => p.id === leave.personId);
        state.leaves.push(leave);
        logAction('İzin Ekleme', `${person.name} için ${leave.reason} eklendi.`);
        saveState('leaves');
        updatePersonnelLeaveStatus();
        renderLeaves();
        renderPersonnel();
        closeModal('leaveModal');
        showToast('İzin başarıyla eklendi.');
    };

    const deleteLeave = (id) => {
        if(confirm('Bu izni silmek istediğinize emin misiniz?')) {
            state.leaves = state.leaves.filter(l => l.id !== id);
            saveState('leaves');
            updatePersonnelLeaveStatus();
            renderLeaves();
            renderPersonnel();
            logAction('İzin Silme', `Bir izin kaydı silindi.`);
            showToast('İzin silindi.', 'error');
        }
    };

    const renderLeaves = () => {
        const tbody = document.querySelector('#leavesTable tbody');
        tbody.innerHTML = '';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const filterVal = document.getElementById('leaveFilter') ? document.getElementById('leaveFilter').value : 'all';

        state.leaves.forEach(l => {
            const endDate = new Date(l.endDate);
            const isPast = endDate < today;
            
            if (filterVal === 'active' && isPast) return;
            if (filterVal === 'past' && !isPast) return;

            const person = state.personnel.find(p => p.id === l.personId);
            const pName = person ? person.name : 'Silinmiş Personel';
            const statusBadge = isPast ? '<span class="badge bg-danger">Pasif/Geçmiş</span>' : '<span class="badge bg-success">Aktif</span>';
            tbody.innerHTML += `<tr><td><strong>${pName}</strong></td><td>${formatDate(l.startDate)}</td><td>${formatDate(l.endDate)}</td><td><span class="badge bg-warning">${l.reason}</span></td><td>${statusBadge}</td><td><button class="btn btn-sm btn-danger" onclick="app.deleteLeave('${l.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
            staggerAnimation('#leavesTable tbody tr');
        });
    };

    const updateBatchActions = () => {
        const checked = document.querySelectorAll('.personnel-cb:checked');
        const batchActions = document.getElementById('batchActions');
        if(batchActions) {
            batchActions.style.display = checked.length > 0 ? 'flex' : 'none';
        }
        const selectAll = document.getElementById('selectAllPersonnel');
        const allCbs = document.querySelectorAll('.personnel-cb');
        if(selectAll && allCbs.length > 0) {
            selectAll.checked = checked.length === allCbs.length;
        }
    };

    const batchDeletePersonnel = () => {
        const checked = Array.from(document.querySelectorAll('.personnel-cb:checked')).map(cb => cb.value);
        if(checked.length === 0) return;
        if(confirm(`Seçili ${checked.length} personeli sistemden silmek istediğinize emin misiniz?`)) {
            state.personnel = state.personnel.filter(p => !checked.includes(p.id));
            saveState('personnel');
            renderPersonnel();
            logAction('Toplu Silme', `${checked.length} personel sistemden silindi.`);
            showToast(`${checked.length} personel başarıyla silindi.`, 'error');
        }
    };

    const openBatchLeaveModal = () => {
        const checked = document.querySelectorAll('.personnel-cb:checked');
        if(checked.length === 0) return;
        document.getElementById('batchLeaveCount').innerText = checked.length;
        document.getElementById('batchLeaveForm').reset();
        openModal('batchLeaveModal');
    };

    const handleBatchLeaveSubmit = (e) => {
        e.preventDefault();
        const start = new Date(document.getElementById('bl_start').value);
        const end = new Date(document.getElementById('bl_end').value);
        if (start > end) return showToast('Bitiş tarihi başlangıçtan önce olamaz!', 'error');

        const checked = Array.from(document.querySelectorAll('.personnel-cb:checked')).map(cb => cb.value);
        const reason = document.getElementById('bl_reason').value;
        const startDate = document.getElementById('bl_start').value;
        const endDate = document.getElementById('bl_end').value;

        checked.forEach(personId => {
            state.leaves.push({ id: generateId(), personId, startDate, endDate, reason });
        });

        saveState('leaves');
        updatePersonnelLeaveStatus();
        renderLeaves();
        renderPersonnel();
        closeModal('batchLeaveModal');
        logAction('Toplu İzin', `${checked.length} personele ${reason} eklendi.`);
        showToast(`${checked.length} personele başarıyla izin eklendi.`);
    };

    // --- Shift Algorithm ---
    const handleShiftGenerate = (e) => {
        e.preventDefault();
        const start = new Date(document.getElementById('s_start').value);
        const end = new Date(document.getElementById('s_end').value);
        
        const locationCheckboxes = document.querySelectorAll('input[name="s_locations"]:checked');
        const selectedLocations = Array.from(locationCheckboxes).map(cb => cb.value);

        if (selectedLocations.length === 0) return showToast('Lütfen en az bir görev noktası seçin!', 'error');

        const mCount = parseInt(document.getElementById('s_morning_count').value) || 0;
        const eCount = parseInt(document.getElementById('s_evening_count').value) || 0;
        const nCount = parseInt(document.getElementById('s_night_count').value) || 0;
        
        if (start > end) return showToast('Bitiş tarihi başlangıçtan önce olamaz!', 'error');
        
        const availablePool = state.personnel.filter(p => p.isActive && !p.onLeave);
        const totalRequiredPerDay = selectedLocations.length * (mCount + eCount + nCount);
        
        if(availablePool.length < totalRequiredPerDay && totalRequiredPerDay > 0) {
             showToast(`Uyarı: Günlük ${totalRequiredPerDay} personel gerekiyor ancak ${availablePool.length} aktif var. Eksikler olabilir!`, 'warning');
        }

        // Reset shift stats for fair dist
        let shiftStats = {};
        availablePool.forEach(p => shiftStats[p.id] = { total: 0, workedDates: [] });

        // Geçmiş vardiyalardan (son 6 günün) çalışma geçmişini yükle (Önceki planlamalarla çakışmaması için)
        const historyStart = new Date(start);
        historyStart.setDate(historyStart.getDate() - 6);
        const historyStartStr = historyStart.toISOString().split('T')[0];
        const startStr = start.toISOString().split('T')[0];

        state.shifts.forEach(s => {
            if (s.date >= historyStartStr && s.date < startStr) {
                const addWorkedDate = (arr) => {
                    arr.forEach(p => {
                        if (shiftStats[p.id] && !shiftStats[p.id].workedDates.includes(s.date)) {
                            shiftStats[p.id].workedDates.push(s.date);
                        }
                    });
                };
                addWorkedDate(s.morning);
                addWorkedDate(s.evening);
                addWorkedDate(s.night);
            }
        });

        const generatedShifts = [];
        let prevNightWorkers = new Set();

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const currentDateStr = d.toISOString().split('T')[0];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6; // 0: Pazar, 6: Cumartesi

            // Find who is on leave exactly on this date 'd'
            const onLeaveTodayIds = new Set(state.leaves.filter(l => {
                const ls = new Date(l.startDate);
                const le = new Date(l.endDate);
                return d >= ls && d <= le;
            }).map(l => l.personId));

            const workedToday = new Set();
            const currentNightWorkers = new Set();

            // 6 Gün kuralı: Son 6 günde 6 kez çalışmışsa bugün (7. gün) zorunlu izin yapmalı
            const sixDaysAgo = new Date(d);
            sixDaysAgo.setDate(d.getDate() - 6);
            const sixDaysAgoStr = sixDaysAgo.toISOString().split('T')[0];

            const mandatoryOffIds = new Set();
            availablePool.forEach(p => {
                const recentWorked = shiftStats[p.id].workedDates.filter(wd => wd >= sixDaysAgoStr).length;
                if (recentWorked >= 6) mandatoryOffIds.add(p.id);
            });

            // Helper to pick workers fairly
            const pickWorker = (excludeSet = new Set(), needed = 1) => {
                // Sadece Joker OLMAYAN personelleri standart aday olarak belirle
                // Güvenlik B Noktası rolündekileri genel havuzdan çıkar (onlar sabit)
                let candidates = availablePool.filter(p => 
                    p.role !== 'Güvenlik B Noktası' && 
                    !p.isJoker && !excludeSet.has(p.id) && !onLeaveTodayIds.has(p.id) && !mandatoryOffIds.has(p.id)
                );
                if (isWeekend) candidates = candidates.filter(p => !p.noWeekends);

                // En aza giden öncelikli, aynı sayıdaysa KARIŞIK/Rastgele dağıt
                candidates.sort((a, b) => {
                    if (shiftStats[a.id].total === shiftStats[b.id].total) return Math.random() - 0.5;
                    return shiftStats[a.id].total - shiftStats[b.id].total;
                });
                
                // Eğer standart adaylar yetersizse, sadece kalan boşluklar için Jokerleri dahil et
                if(candidates.length < needed) {
                     let jokerCandidates = availablePool.filter(p => p.isJoker && !excludeSet.has(p.id) && !onLeaveTodayIds.has(p.id) && !mandatoryOffIds.has(p.id));
                     if (isWeekend) candidates = candidates.filter(p => !p.noWeekends);
                     
                     jokerCandidates.sort((a, b) => {
                         if (shiftStats[a.id].total === shiftStats[b.id].total) return Math.random() - 0.5;
                         return shiftStats[a.id].total - shiftStats[b.id].total;
                     });
                     
                     const missing = needed - candidates.length;
                     const pickedJokers = jokerCandidates.slice(0, missing);
                     candidates = [...candidates, ...pickedJokers];
                     if(pickedJokers.length > 0) showToast(`${currentDateStr} tarihinde Joker kullanıldı.`, 'warning');
                }
                
                const picked = candidates.slice(0, needed);
                picked.forEach(p => shiftStats[p.id].total++);
                return picked.map(p => ({ id: p.id, name: p.name }));
            };

            selectedLocations.forEach(loc => {
                const dayShift = { date: currentDateStr, location: loc, morning: [], evening: [], night: [], reqM: mCount, reqE: eCount, reqN: nCount };

                if (loc === 'Güvenlik B Noktası') {
                    // Güvenlik B Noktası için sabit Sabah personellerini ata
                    const fixedPersonnel = availablePool.filter(p => p.role === 'Güvenlik B Noktası' && !onLeaveTodayIds.has(p.id));
                    dayShift.morning = fixedPersonnel.map(p => ({ id: p.id, name: p.name }));
                    dayShift.morning.forEach(p => {
                        workedToday.add(p.id);
                        if (shiftStats[p.id]) {
                            shiftStats[p.id].total++;
                            shiftStats[p.id].workedDates.push(currentDateStr);
                        }
                    });
                    dayShift.reqE = 0; // Akşam vardiyası yok
                    dayShift.reqN = 0; // Gece vardiyası yok
                } else {
                    // Morning
                    const excludeForMorning = new Set([...prevNightWorkers, ...workedToday]);
                    dayShift.morning = pickWorker(excludeForMorning, mCount);
                    dayShift.morning.forEach(p => workedToday.add(p.id));

                    // Evening
                    const excludeForEvening = new Set(workedToday);
                    dayShift.evening = pickWorker(excludeForEvening, eCount);
                    dayShift.evening.forEach(p => workedToday.add(p.id));

                    // Night
                    const excludeForNight = new Set([...workedToday, ...prevNightWorkers]);
                    dayShift.night = pickWorker(excludeForNight, nCount);
                    dayShift.night.forEach(p => {
                        workedToday.add(p.id);
                        currentNightWorkers.add(p.id);
                    });
                }

                generatedShifts.push(dayShift);
            });
            
            prevNightWorkers = currentNightWorkers;
        }

        // Daha önce aynı tarih ve noktada olan vardiyaları sil, yenileri ekle
        const newShifts = state.shifts.filter(s => !generatedShifts.some(gs => gs.date === s.date && gs.location === s.location));
        state.shifts = [...newShifts, ...generatedShifts];
        state.shifts.sort((a, b) => new Date(a.date) - new Date(b.date)); // Tarihe göre sırala
        saveState('shifts');
        logAction('Otomasyon', `${start.toLocaleDateString()} - ${end.toLocaleDateString()} arası vardiyalar oluşturuldu.`);
        showToast('Vardiyalar başarıyla oluşturuldu!');
        renderShifts();
        closeModal('shiftModal');
    };

    const openManualAssign = (date, location, slotType) => {
        const shift = state.shifts.find(s => s.date === date && s.location === location);
        if (!shift) return;

        document.getElementById('ma_date').value = date;
        document.getElementById('ma_location').value = location;
        document.getElementById('ma_slot').value = slotType;

        const slotName = slotType === 'morning' ? 'Sabah' : slotType === 'evening' ? 'Akşam' : 'Gece';
        document.getElementById('ma_info').innerHTML = `<strong>${formatDate(date)}</strong> - ${location || 'Genel'} / <strong>${slotName}</strong> Vardiyası`;

        const currentAssignedIds = shift[slotType].map(p => p.id);
        const activePersonnel = state.personnel.filter(p => p.isActive);

        const listContainer = document.getElementById('ma_personnel_list');
        listContainer.innerHTML = activePersonnel.map(p => `
            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer; color: var(--text-main); font-size: 0.95rem;">
                <input type="checkbox" name="ma_personnel" value="${p.id}" ${currentAssignedIds.includes(p.id) ? 'checked' : ''}>
                ${p.name} <span class="text-muted text-sm">(${p.role})</span>
            </label>
        `).join('');

        openModal('manualAssignModal');
    };

    const handleManualAssignSubmit = (e) => {
        e.preventDefault();
        const date = document.getElementById('ma_date').value;
        const location = document.getElementById('ma_location').value;
        const slotType = document.getElementById('ma_slot').value;
        const selectedIds = Array.from(document.querySelectorAll('input[name="ma_personnel"]:checked')).map(cb => cb.value);
        
        const shiftIndex = state.shifts.findIndex(s => s.date === date && s.location === location);
        if (shiftIndex > -1) {
            state.shifts[shiftIndex][slotType] = selectedIds.map(id => {
                const p = state.personnel.find(per => per.id === id);
                return { id: p.id, name: p.name };
            });
            saveState('shifts');
            renderShifts();
            closeModal('manualAssignModal');
            showToast('Vardiya manuel olarak güncellendi.');
        }
    };

    const renderShifts = () => {
        const container = document.getElementById('shiftCalendar');
        container.innerHTML = '';
        state.shifts.forEach(shift => {
            const d = new Date(shift.date);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const drawSlot = (arr, req, slotType) => {
                let content = '';
                if (req === 0) content = '<span class="text-muted">Planlanmadı</span>';
                else if (arr.length === 0 && req !== 0 && req !== undefined) content = '<span class="text-danger">Eksik!</span>';
                else {
                    content = arr.map(p => p.name).join(', ');
                    if (arr.length < req) content += ' <span class="text-danger" style="font-size:0.8rem;">(Eksik)</span>';
                }
                return `<span class="clickable-slot" onclick="app.openManualAssign('${shift.date}', '${shift.location}', '${slotType}')" title="Kişi atamak/değiştirmek için tıklayın">${content}</span>`;
            };
            container.innerHTML += `
                <div class="shift-day-card fade-in ${isWeekend ? 'weekend' : ''}">
                    <div class="shift-day-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 5px;">
                        <span>${formatDate(shift.date)}</span> 
                        ${getLocationBadge(shift.location)}
                    </div>
                    <div class="shift-slots">
                        <div class="slot morning"><h4><i class="fas fa-sun" style="color: var(--warning);"></i> Sabah</h4><p>${drawSlot(shift.morning, shift.reqM, 'morning')}</p></div>
                        <div class="slot evening"><h4><i class="fas fa-cloud-sun" style="color: var(--danger);"></i> Akşam</h4><p>${drawSlot(shift.evening, shift.reqE, 'evening')}</p></div>
                        <div class="slot night"><h4><i class="fas fa-moon" style="color: var(--primary);"></i> Gece</h4><p>${drawSlot(shift.night, shift.reqN, 'night')}</p></div>
                    </div>
                </div>
            `;
        });
        renderReports();
        staggerAnimation('.shift-day-card');
        apply3DParallax('.shift-day-card'); // Dinamik üretilen kartlara da efekti ata
    };

    const setShiftRange = (type) => {
        const start = new Date();
        const end = new Date();
        if (type === 'week') end.setDate(end.getDate() + 7);
        if (type === 'month') end.setMonth(end.getMonth() + 1);
        if (type === 'year') end.setFullYear(end.getFullYear() + 1);
        
        document.getElementById('s_start').value = start.toISOString().split('T')[0];
        document.getElementById('s_end').value = end.toISOString().split('T')[0];
    };

    // --- Reports & Exports ---
    const renderReports = () => {
        const tbody = document.querySelector('#reportsTable tbody');
        tbody.innerHTML = '';
        
        const filterMonth = document.getElementById('reportMonthFilter') ? document.getElementById('reportMonthFilter').value : '';
        let filteredShifts = state.shifts;
        
        if (filterMonth) {
            filteredShifts = state.shifts.filter(s => s.date.startsWith(filterMonth));
        }
        
        const threshold = state.settings.monthlyHours;
        const textEl = document.getElementById('standardHoursText');
        if(textEl) textEl.innerText = threshold + ' saat';
        
        let reportData = state.personnel.map(p => ({ id: p.id, name: p.name, m:0, e:0, n:0, total:0, locDetails: {} }));
        
        filteredShifts.forEach(s => {
            const loc = s.location || 'Genel';
            const addShiftToReport = (p, type) => {
                let r = reportData.find(x=>x.id===p.id);
                if(r) {
                    r.total++;
                    if (!r.locDetails[loc]) r.locDetails[loc] = { m:0, e:0, n:0 };
                    r.locDetails[loc][type]++;
                    r[type]++;
                }
                return r;
            };
            s.morning.forEach(p => addShiftToReport(p, 'm'));
            s.evening.forEach(p => addShiftToReport(p, 'e'));
            s.night.forEach(p => addShiftToReport(p, 'n'));
        });

        const times = state.settings.shiftTimes || { morning: 7, evening: 15, night: 23 };
        const mRange = `${String(times.morning).padStart(2, '0')}:00 - ${String(times.evening).padStart(2, '0')}:00`;
        const eRange = `${String(times.evening).padStart(2, '0')}:00 - ${times.night === 0 ? '00' : String(times.night).padStart(2, '0')}:00`;
        const nRange = `${times.night === 0 ? '00' : String(times.night).padStart(2, '0')}:00 - ${String(times.morning).padStart(2, '0')}:00`;

        let filteredReportData = reportData.filter(r => r.total > 0).map(r => {
            const totalHours = r.total * 8; // Her vardiya 8 saat olarak hesaplanmıştır
            const overtime = Math.max(0, totalHours - threshold); // Eşiği geçen kısım fazla mesai
            const locsText = Object.entries(r.locDetails).map(([loc, s]) => `${loc}: S:${s.m} A:${s.e} G:${s.n}`).join(', ');
            const locsHtml = Object.entries(r.locDetails).map(([loc, s]) => {
                let detailStr = '';
                if(s.m > 0) detailStr += `<div style="font-size:0.75rem; color:var(--text-muted);"><i class="fas fa-sun" style="color:var(--warning)"></i> Sabah (${mRange}): <strong>${s.m} Vardiya / ${s.m * 8} Saat</strong></div>`;
                if(s.e > 0) detailStr += `<div style="font-size:0.75rem; color:var(--text-muted);"><i class="fas fa-cloud-sun" style="color:var(--danger)"></i> Akşam (${eRange}): <strong>${s.e} Vardiya / ${s.e * 8} Saat</strong></div>`;
                if(s.n > 0) detailStr += `<div style="font-size:0.75rem; color:var(--text-muted);"><i class="fas fa-moon" style="color:var(--primary)"></i> Gece (${nRange}): <strong>${s.n} Vardiya / ${s.n * 8} Saat</strong></div>`;
                
                return `
                    <div style="margin-bottom: 12px; border-left: 3px solid var(--primary); padding-left: 12px; background: rgba(var(--primary-rgb), 0.02); border-radius: 0 8px 8px 0; padding-top: 5px; padding-bottom: 5px;">
                        <div style="margin-bottom: 5px;">${getLocationBadge(loc)}</div>
                        ${detailStr}
                    </div>
                `;
            }).join('');
            return { ...r, totalHours, overtime, locsText, locsHtml };
        });

        // Apply Sorting
        filteredReportData.sort((a, b) => {
            let valA = a[currentReportSort.column];
            let valB = b[currentReportSort.column];
            
            if (currentReportSort.column === 'locations') {
                valA = a.locsText;
                valB = b.locsText;
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            
            if (valA < valB) return currentReportSort.asc ? -1 : 1;
            if (valA > valB) return currentReportSort.asc ? 1 : -1;
            return 0;
        });

        filteredReportData.forEach(r => {
            const overtimeHtml = r.overtime > 0 ? `<span class="badge bg-danger">+${r.overtime} Saat</span>` : `<span class="text-muted">-</span>`;
            tbody.innerHTML += `<tr><td><strong>${r.name}</strong></td><td>${r.locsHtml}</td><td>${r.total}</td><td><strong>${r.totalHours} Saat</strong></td><td>${overtimeHtml}</td><td>${r.m}</td><td>${r.e}</td><td>${r.n}</td></tr>`;
        });
    };

    const generateReport = (e) => {
        const btn = e ? e.currentTarget : null;
        let originalContent = '';
        if (btn) {
            btn.disabled = true;
            originalContent = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rapor Hazırlanıyor...';
        }

        setTimeout(() => {
            renderReports();
            showToast('Seçili ay raporu başarıyla oluşturuldu.');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalContent;
            }
        }, 800);
    };

    const exportCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,Personel,Mesai Dağılımı (Konum),Toplam Vardiya,Toplam Saat,Fazla Mesai,Sabah,Aksam,Gece\n";
        document.querySelectorAll('#reportsTable tbody tr').forEach(row => {
            let cols = row.querySelectorAll('td');
            csvContent += Array.from(cols).map(c => `"${c.innerText}"`).join(",") + "\n";
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "vardiya_raporu.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        logAction('Dışa Aktarım', 'Rapor CSV olarak indirildi.');
    };

    const exportReportWord = () => {
        const table = document.getElementById('reportsTable');
        if (!table || table.querySelectorAll('tbody tr').length === 0) return showToast('Dışa aktarılacak veri bulunamadı.', 'warning');

        const month = document.getElementById('reportMonthFilter').value;
        const now = new Date().toLocaleString('tr-TR');

        let content = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset='utf-8'><title>Vardiya Raporu</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; }
                .h { color: #4361ee; border-bottom: 2px solid #4361ee; padding-bottom: 10px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background-color: #f8fafc; color: #4361ee; border: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 10pt; }
                td { border: 1px solid #e2e8f0; padding: 8px; font-size: 9pt; vertical-align: top; }
                .b { font-weight: bold; }
            </style>
            </head>
            <body>
                <div class="h">
                    <h2>PERSONEL MESAİ RAPORU</h2>
                    <p>Dönem: ${month} | Rapor Tarihi: ${now}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Personel</th>
                            <th>Konum & Mesai Detayı</th>
                            <th>Toplam Vardiya</th>
                            <th>Toplam Saat</th>
                            <th>Fazla Mesai</th>
                        </tr>
                    </thead>
                    <tbody>`;

        document.querySelectorAll('#reportsTable tbody tr').forEach(row => {
            const cols = row.querySelectorAll('td');
            content += `
                <tr>
                    <td class="b">${cols[0].innerText}</td>
                    <td>${cols[1].innerText}</td>
                    <td>${cols[2].innerText}</td>
                    <td class="b">${cols[3].innerText}</td>
                    <td>${cols[4].innerText}</td>
                </tr>`;
        });

        content += '</tbody></table></body></html>';
        const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(content);
        const fileDownload = document.createElement("a");
        fileDownload.href = source;
        fileDownload.download = `mesai_raporu_${month}.doc`;
        document.body.appendChild(fileDownload);
        fileDownload.click();
        fileDownload.remove();
        logAction('Dışa Aktarım', 'Rapor Word (.doc) olarak indirildi.');
    };

    const exportShiftsExcel = () => {
        if (typeof XLSX === 'undefined') return showToast('Excel kütüphanesi yüklenemedi.', 'error');
        if (state.shifts.length === 0) return showToast('Dışa aktarılacak vardiya bulunamadı.', 'warning');

        const times = state.settings.shiftTimes || { morning: 7, evening: 15, night: 23 };
        const data = state.shifts.map(shift => ({
            'Tarih': formatDate(shift.date),
            'Güvenlik Noktası': shift.location || 'Genel',
            [`Sabah (${String(times.morning).padStart(2, '0')}:00 - ${String(times.evening).padStart(2, '0')}:00)`]: shift.morning.map(p => p.name).join(', ') || 'Eksik',
            [`Akşam (${String(times.evening).padStart(2, '0')}:00 - ${String(times.night).padStart(2, '0')}:00)`]: shift.evening.map(p => p.name).join(', ') || 'Eksik',
            [`Gece (${String(times.night).padStart(2, '0')}:00 - ${String(times.morning).padStart(2, '0')}:00)`]: shift.night.map(p => p.name).join(', ') || 'Eksik'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Vardiyalar");
        XLSX.writeFile(wb, "vardiya_takvimi.xlsx");
        
        logAction('Dışa Aktarım', 'Vardiya takvimi Excel (.xlsx) olarak indirildi.');
    };

    const exportShiftsPDF = () => {
        document.body.classList.add('print-shift-mode');
        window.print();
        document.body.classList.remove('print-shift-mode');
        logAction('Yazdırma', 'Vardiya takvimi PDF olarak yazdırıldı.');
    };

    const exportShiftsWord = () => {
        if (state.shifts.length === 0) return showToast('Dışa aktarılacak vardiya bulunamadı.', 'warning');

        let content = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset='utf-8'><title>Vardiya Takvimi</title>
            <style>
                body { font-family: 'Segoe UI', Calibri, sans-serif; background-color: #f1f5f9; padding: 20px; }
                h1 { text-align: center; color: #0f172a; }
                .shift-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 15px; border-left: 6px solid #4361ee; page-break-inside: avoid; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .shift-header { font-size: 14pt; font-weight: bold; margin-bottom: 15px; color: #4361ee; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
                .slots-container { display: table; width: 100%; }
                .slot { display: table-cell; width: 33%; padding: 10px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 8px; }
                .slot-title { font-size: 11pt; font-weight: bold; color: #64748b; margin-bottom: 5px; display: block; }
                .slot-personnel { font-size: 11pt; color: #0f172a; font-weight: bold; }
                .text-danger { color: #ef4444; font-weight: bold; }
                .text-muted { color: #64748b; }
            </style>
            </head>
            <body>
            <h1>Vardiya Takvimi</h1>
        `;

        const drawSlot = (arr, req) => {
            if (req === 0) return '<span class="text-muted">Planlanmadı</span>';
            if (arr.length === 0 && req !== 0 && req !== undefined) return '<span class="text-danger">Eksik!</span>';
            let res = arr.map(p => p.name).join(', ');
            if (arr.length < req) res += ' <span class="text-danger">(Eksik)</span>';
            return res;
        };

        state.shifts.forEach(shift => {
            content += `
                <div class="shift-card">
                    <div class="shift-header">${formatDate(shift.date)} - ${shift.location || 'Genel'}</div>
                    <div class="slots-container">
                        <div class="slot"><span class="slot-title">&#9728;&#65039; Sabah</span><br><span class="slot-personnel">${drawSlot(shift.morning, shift.reqM)}</span></div>
                        <div class="slot"><span class="slot-title">&#9925;&#65039; Akşam</span><br><span class="slot-personnel">${drawSlot(shift.evening, shift.reqE)}</span></div>
                        <div class="slot"><span class="slot-title">&#127183; Gece</span><br><span class="slot-personnel">${drawSlot(shift.night, shift.reqN)}</span></div>
                    </div>
                </div>
            `;
        });

        content += '</body></html>';

        const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(content);
        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = source;
        fileDownload.download = `vardiya_takvimi_${new Date().toISOString().split('T')[0]}.doc`;
        fileDownload.click();
        document.body.removeChild(fileDownload);

        logAction('Dışa Aktarım', 'Vardiya takvimi Word (.doc) olarak indirildi.');
    };

    const exportPDFDownload = () => {
        let originalColorO, originalColorP; // P was kept for logic safety if needed
        if (window.occupancyChartInstance) {
            originalColorO = window.occupancyChartInstance.options.scales.x.ticks.color;
            window.occupancyChartInstance.options.scales.x.ticks.color = '#000';
            window.occupancyChartInstance.options.scales.y.ticks.color = '#000';
            window.occupancyChartInstance.update();
        }

        // Yazdırma tarihini ayarla
        const dateEl = document.getElementById('pdfReportDate');
        const now = new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        if (dateEl) dateEl.innerHTML = `<strong>Rapor Tarihi:</strong> ${now}<br><strong>Durum:</strong> Sistem Çıktısı / PDF`;

        document.body.classList.add('print-report-mode');
        window.print();
        document.body.classList.remove('print-report-mode');
        
        // Grafikleri eski temasına döndür
        if (window.occupancyChartInstance && originalColorO) {
            window.occupancyChartInstance.options.scales.x.ticks.color = originalColorO;
            window.occupancyChartInstance.options.scales.y.ticks.color = originalColorO;
            window.occupancyChartInstance.update();
        }

        logAction('Dışa Aktarım', 'Rapor tüm sayfa detaylarıyla PDF olarak indirildi/yazdırıldı.');
    };

    // --- Logs & Dashboard ---
    const renderLogs = () => {
        const tbody = document.querySelector('#logsTable tbody');
        tbody.innerHTML = state.logs.map(l => `<tr><td>${new Date(l.date).toLocaleString('tr-TR')}</td><td><span class="badge bg-main">${l.type}</span></td><td>${l.description}</td></tr>`).join('');

        // Update Dashboard Activity Stream (Top 5)
        const streamContainer = document.getElementById('recentActivityStream');
        if(streamContainer) {
            const recentLogs = state.logs.slice(0, 5);
            streamContainer.innerHTML = recentLogs.length 
                ? recentLogs.map(l => `
                    <div class="activity-item">
                        <span class="activity-time"><i class="far fa-clock"></i> ${new Date(l.date).toLocaleString('tr-TR')}</span>
                        <strong>${l.type}:</strong> ${l.description}
                    </div>
                  `).join('')
                : '<p class="text-muted">Henüz bir işlem yapılmadı.</p>';
            staggerAnimation('#logsTable tbody tr');
            staggerAnimation('#recentActivityStream .activity-item', 'slideDownStagger');
        }
    };

    const updateDashboard = () => {
        const activeCount = state.personnel.filter(p => p.isActive && !p.onLeave).length;
        const passiveCount = state.personnel.filter(p => p.onLeave || !p.isActive).length;
        const totalCount = state.personnel.length;

        const totalEl = document.getElementById('statTotalUsers');
        const activeEl = document.getElementById('statActiveUsers');
        const passiveEl = document.getElementById('statLeaveUsers');

        // Sadece değer değiştiğinde animasyonu tetikle (gereksiz işlemden kaçınmak için)
        if (totalEl.dataset.val != totalCount) { totalEl.dataset.val = totalCount; animateCounter(totalEl, totalCount); }
        if (activeEl.dataset.val != activeCount) { activeEl.dataset.val = activeCount; animateCounter(activeEl, activeCount); }
        if (passiveEl.dataset.val != passiveCount) { passiveEl.dataset.val = passiveCount; animateCounter(passiveEl, passiveCount); }

        // Günün Vardiyası Widget'ını Doldur
        const todayContainer = document.getElementById('todayShifts');
        const todayStr = new Date().toISOString().split('T')[0];
        const todayShifts = state.shifts.filter(s => s.date === todayStr);
        if (todayShifts.length > 0) {
            const drawSlot = (arr, req, shift, slotType) => {
                let content = '';
                if (req === 0) content = '<span class="text-muted">Planlanmadı</span>';
                else if (arr.length === 0 && req !== 0 && req !== undefined) content = '<span class="text-danger">Eksik!</span>';
                else {
                    content = arr.map(p => p.name).join(', ');
                    if (arr.length < req) content += ' <span class="text-danger" style="font-size:0.8rem;">(Eksik)</span>';
                }
                return `<span class="clickable-slot" onclick="app.openManualAssign('${shift.date}', '${shift.location}', '${slotType}')" title="Kişi atamak/değiştirmek için tıklayın">${content}</span>`;
            };
            todayContainer.innerHTML = todayShifts.map(ts => `
                <div style="margin-top:15px; margin-bottom:10px;">${getLocationBadge(ts.location)}</div>
                <div class="shift-slots" style="margin-bottom: 20px;">
                    <div class="slot morning" style="padding: 12px;"><h4><i class="fas fa-sun" style="color: var(--warning);"></i> Sabah</h4><p>${drawSlot(ts.morning, ts.reqM, ts, 'morning')}</p></div>
                    <div class="slot evening" style="padding: 12px;"><h4><i class="fas fa-cloud-sun" style="color: var(--danger);"></i> Akşam</h4><p>${drawSlot(ts.evening, ts.reqE, ts, 'evening')}</p></div>
                    <div class="slot night" style="padding: 12px;"><h4><i class="fas fa-moon" style="color: var(--primary);"></i> Gece</h4><p>${drawSlot(ts.night, ts.reqN, ts, 'night')}</p></div>
                </div>
            `).join('');
        } else {
            todayContainer.innerHTML = '<p class="text-muted" style="margin-top: 15px;"><i class="fas fa-info-circle"></i> Bugün için planlanmış bir vardiya bulunmuyor.</p>';
        }

        // Son 7 Gün Doluluk Oranı Grafiği İçin Veri Hesaplama
        const last7Days = [];
        const occupancyData = [];
        const todayDate = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(todayDate);
            d.setDate(d.getDate() - i);
            const dStr = d.toISOString().split('T')[0];
            last7Days.push(d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }));
            
            const dayShifts = state.shifts.filter(s => s.date === dStr);
            if (dayShifts.length === 0) {
                occupancyData.push(0);
            } else {
                let totalAssigned = 0;
                let totalRequired = 0;
                dayShifts.forEach(s => {
                    totalAssigned += s.morning.length + s.evening.length + s.night.length;
                    totalRequired += (s.reqM !== undefined ? s.reqM : 2) + (s.reqE !== undefined ? s.reqE : 2) + (s.reqN !== undefined ? s.reqN : 1);
                });
                occupancyData.push(Math.round((totalAssigned / totalRequired) * 100));
            }
        }

        // Doluluk Oranı Çubuk Grafiği (Chart.js) Güncelle
        const ctxOcc = document.getElementById('occupancyChart');
        if (ctxOcc && typeof Chart !== 'undefined') {
            const chartTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#666';
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#4361ee';
            
            if (window.occupancyChartInstance) {
                window.occupancyChartInstance.data.labels = last7Days;
                window.occupancyChartInstance.data.datasets[0].data = occupancyData;
                window.occupancyChartInstance.data.datasets[0].backgroundColor = primaryColor;
                window.occupancyChartInstance.options.scales.x.ticks.color = chartTextColor;
                window.occupancyChartInstance.options.scales.y.ticks.color = chartTextColor;
                window.occupancyChartInstance.update();
            } else {
                window.occupancyChartInstance = new Chart(ctxOcc, {
                    type: 'bar',
                    data: { labels: last7Days, datasets: [{ label: 'Doluluk Oranı (%)', data: occupancyData, backgroundColor: primaryColor, borderRadius: 6, barThickness: 20 }] },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { 
                            legend: { display: false },
                            tooltip: { 
                                backgroundColor: 'rgba(15, 23, 42, 0.85)', padding: 12, cornerRadius: 12, titleFont: { size: 13, family: "'Inter', sans-serif" }, bodyFont: { size: 13, family: "'Inter', sans-serif" }, displayColors: false, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 
                            } 
                        }, 
                        scales: {
                            y: { beginAtZero: true, max: 100, ticks: { color: chartTextColor } },
                            x: { ticks: { color: chartTextColor } }
                        }
                    }
                });
            }
        }
    };

    // Public API
    return {
        init: () => {
            updatePersonnelLeaveStatus();
            initUI(); 
            initShiftCountdown(); 
            renderPersonnel(); 
            renderLeaves(); 
            renderShifts(); 
            renderLogs(); 
            
            // Arka Planda Periyodik Otomatik Güncelleme (1 Dakikada Bir)
            setInterval(() => {
                updatePersonnelLeaveStatus();
                renderPersonnel();
            }, 60000);

            // Çoklu Sekme (Cross-Tab) Senkronizasyonu
            window.addEventListener('storage', (e) => {
                if (e.key && e.key.startsWith('vys_')) {
                    Object.keys(state).forEach(key => state[key] = JSON.parse(localStorage.getItem(`vys_${key}`)) || state[key]);
                    updatePersonnelLeaveStatus();
                    renderPersonnel(); renderLeaves(); renderShifts(); renderLogs();
                }
            });
        },
        openModal, closeModal, handlePersonnelSubmit, deletePerson, editPerson, showPersonnelDetails, setShiftRange,
        handleLeaveSubmit, deleteLeave, addLocation, deleteLocation, saveGeneralSettings, exportBackup, generateReport, exportCSV, exportReportWord, exportShiftsExcel, exportShiftsPDF, exportShiftsWord, downloadExcelTemplate, exportPDFDownload, openManualAssign, resetSystem, batchDeletePersonnel, openBatchLeaveModal,
        clearLogs: () => { if(confirm('Logları sil?')) { state.logs = []; saveState('logs'); renderLogs(); } }
    };
})();

// Sistemi ve Arayüzü Başlat
app.init();