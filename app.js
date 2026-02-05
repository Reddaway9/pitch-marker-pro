// Pitch Marker Pro - Main Application Logic

// ==================== SITE MANAGEMENT ====================
// Multi-site data structure
let currentSite = null; // { name, location: {lat, lng, address}, pitches: [{config, center, rotation, ...}], created, modified }
let currentPitchIndex = 0; // Which pitch in the site is currently selected

// ==================== PITCH CONFIGURATIONS ====================
// Pitch Configurations (all dimensions in yards, converted to meters for calculations)
const YARDS_TO_METERS = 0.9144;

const PITCH_CONFIGS = {
    '5v5': {
        name: '5v5 Mini Soccer',
        length: 40,
        width: 30,
        penaltyAreaLength: 9,
        penaltyAreaWidth: 16,
        goalAreaLength: 0,  // No goal kick box for 5v5
        goalAreaWidth: 0,
        penaltySpotDistance: 6.5,  // Distance from goal line (yards)
        centerCircleRadius: 3      // Radius in yards (optional on 5v5)
    },
    '7v7': {
        name: '7v7 Mini Soccer',
        length: 60,
        width: 40,
        penaltyAreaLength: 10,
        penaltyAreaWidth: 18,
        goalAreaLength: 0,  // No goal kick box for 7v7
        goalAreaWidth: 0,
        penaltySpotDistance: 8,    // Distance from goal line (yards)
        centerCircleRadius: 6      // Radius in yards (optional on 7v7)
    },
    '9v9': {
        name: '9v9 Youth',
        length: 80,
        width: 50,
        penaltyAreaLength: 13,
        penaltyAreaWidth: 32,
        goalAreaLength: 4,
        goalAreaWidth: 14,
        penaltySpotDistance: 9,    // Distance from goal line (yards)
        centerCircleRadius: 8      // Radius in yards
    },
    '11v11-u13': {
        name: '11v11 U13-U14',
        length: 90,
        width: 55,
        penaltyAreaLength: 14,
        penaltyAreaWidth: 35,
        goalAreaLength: 5,
        goalAreaWidth: 16,
        penaltySpotDistance: 12,   // Distance from goal line (yards)
        centerCircleRadius: 10     // Radius in yards
    },
    '11v11-u15': {
        name: '11v11 U15-U16',
        length: 100,
        width: 60,
        penaltyAreaLength: 18,
        penaltyAreaWidth: 44,
        goalAreaLength: 6,
        goalAreaWidth: 20,
        penaltySpotDistance: 12,   // Distance from goal line (yards)
        centerCircleRadius: 10     // Radius in yards
    },
    '11v11-senior': {
        name: '11v11 Senior',
        length: 110,
        width: 70,
        penaltyAreaLength: 18,
        penaltyAreaWidth: 44,
        goalAreaLength: 6,
        goalAreaWidth: 20,
        penaltySpotDistance: 12,   // Distance from goal line (yards)
        centerCircleRadius: 10     // Radius in yards
    }
};

// Global State
let currentPitchConfig = null;
let currentRotation = 0;
let positionMode = 'center'; // 'center' or 'corner'
let lockedCorner = null; // For corner mode - the GPS coordinates
let lockedCornerType = 'bottom-left'; // Which corner: 'bottom-left', 'bottom-right', 'top-right', 'top-left'
let currentPitchCenter = null; // Store the center position for both modes
let map = null;
let pitchPolygon = null;
let userLocationMarker = null;
let watchId = null;
let currentLocation = null;
let pitchCorners = null;
let waypoints = [];
let currentWaypointIndex = 0;
let markedPoints = [];

// Mapbox token
const MAPBOX_TOKEN = 'pk.eyJ1IjoicmVkZGF3YXk4IiwiYSI6ImNtazBjbTJibDQ2bDYzZnNla3h3Yjc0ejIifQ.asYdsWckP5cxwAFSKtOjCw';

// ==================== SITE MANAGEMENT FUNCTIONS ====================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

async function useGPSLocation() {
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000
            });
        });
        
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        createNewSite({
            lat,
            lng,
            address: `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
        });
        
    } catch (error) {
        alert('Unable to get GPS location. Please check permissions or try searching by postcode.');
        console.error('GPS error:', error);
    }
}

async function searchPostcode() {
    const query = document.getElementById('postcode-search').value.trim();
    if (!query) {
        alert('Please enter a postcode or address');
        return;
    }
    
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=GB`
        );
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            const result = data.features[0];
            const [lng, lat] = result.center;
            
            createNewSite({
                lat,
                lng,
                address: result.place_name
            });
        } else {
            alert('Location not found. Please try a different postcode or address.');
        }
    } catch (error) {
        alert('Error searching for location. Please try again.');
        console.error('Geocoding error:', error);
    }
}

function createNewSite(location) {
    // Use temporary default name - user will name it when saving
    const tempName = `Unsaved Site (${location.address || 'New Location'})`;
    
    currentSite = {
        name: tempName,
        location: location,
        pitches: [],
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        isNewUnsaved: true  // Flag to indicate this hasn't been saved yet
    };
    
    currentPitchIndex = 0;
    showScreen('pitch-selection');
}

function saveSiteToStorage(site = currentSite) {
    if (!site) return false;
    
    site.modified = new Date().toISOString();
    
    const sites = getSavedSites();
    const existingIndex = sites.findIndex(s => s.name === site.name && s.created === site.created);
    
    if (existingIndex >= 0) {
        sites[existingIndex] = site;
    } else {
        sites.push(site);
    }
    
    localStorage.setItem('pitch_marker_sites', JSON.stringify(sites));
    return true;
}

function getSavedSites() {
    const sitesJSON = localStorage.getItem('pitch_marker_sites');
    return sitesJSON ? JSON.parse(sitesJSON) : [];
}

function deleteSiteFromStorage(siteName, created) {
    const sites = getSavedSites();
    const filtered = sites.filter(s => !(s.name === siteName && s.created === created));
    localStorage.setItem('pitch_marker_sites', JSON.stringify(filtered));
}

function loadSiteFromStorage(siteName, created) {
    const sites = getSavedSites();
    const site = sites.find(s => s.name === siteName && s.created === created);
    
    if (site) {
        currentSite = site;
        currentPitchIndex = 0;
        
        if (site.pitches && site.pitches.length > 0) {
            showScreen('map-overlay');  // ← Show screen FIRST
            // Use setTimeout to ensure screen is rendered before map initializes
            setTimeout(() => {
                loadPitchFromSite(0);
            }, 0);
        } else {
            showScreen('pitch-selection');
        }
    }
}

function loadSitesListScreen() {
    const sites = getSavedSites();
    const listContainer = document.getElementById('saved-sites-list');
    const noSitesMessage = document.getElementById('no-sites-message');
    
    listContainer.innerHTML = '';
    
    if (sites.length === 0) {
        noSitesMessage.style.display = 'block';
    } else {
        noSitesMessage.style.display = 'none';
        
        sites.forEach(site => {
            const siteItem = document.createElement('div');
            siteItem.className = 'saved-site-item';
            siteItem.innerHTML = `
                <div class="saved-site-info">
                    <h3>${site.name}</h3>
                    <p>${site.pitches.length} pitch${site.pitches.length !== 1 ? 'es' : ''} • ${new Date(site.modified).toLocaleDateString()}</p>
                    <p style="font-size: 0.85em; opacity: 0.6;">${site.location.address}</p>
                </div>
                <button class="delete-site-btn" onclick="event.stopPropagation(); deleteSiteConfirm('${site.name}', '${site.created}')">Delete</button>
            `;
            
            siteItem.addEventListener('click', () => {
                loadSiteFromStorage(site.name, site.created);
            });
            
            listContainer.appendChild(siteItem);
        });
    }
    
    showScreen('load-site-selection');
}

function deleteSiteConfirm(siteName, created) {
    if (confirm(`Delete site "${siteName}"?`)) {
        deleteSiteFromStorage(siteName, created);
        loadSitesListScreen();
    }
}

window.deleteSiteConfirm = deleteSiteConfirm;

function loadPitchFromSite(index) {
    if (!currentSite || !currentSite.pitches[index]) return;
    
    const pitch = currentSite.pitches[index];
    currentPitchIndex = index;
    currentPitchConfig = PITCH_CONFIGS[pitch.size];
    currentRotation = pitch.rotation || 0;
    currentPitchCenter = pitch.center ? [pitch.center.lng, pitch.center.lat] : [currentSite.location.lng, currentSite.location.lat];
    
    // Update rotation controls to match loaded pitch
    document.getElementById('rotation-slider').value = currentRotation;
    document.getElementById('rotation-input').value = currentRotation;
    
    // If map exists, just update view and overlays
    if (map) {
        // Move map to show this pitch
        map.flyTo({
            center: currentPitchCenter,
            zoom: map.getZoom(),
            duration: 1000
        });
        
        // Update UI and overlays
        updateSiteUI();
        pitchCorners = calculatePitchCorners(currentPitchCenter, currentPitchConfig, currentRotation);
        updateAllPitchOverlays();
    } else {
        // Map doesn't exist yet - initialize it
        initMap();
        updateSiteUI();
    }
}

// ==================== SITE UI MANAGEMENT ====================

function updateSiteUI() {
    if (!currentSite) return;
    
    // Update site name
    const siteNameEl = document.getElementById('site-name');
    if (siteNameEl) siteNameEl.textContent = currentSite.name;
    
    // Update pitch selector
    updatePitchSelector();
    
    // Enable/disable delete button
    const deleteBtn = document.getElementById('delete-pitch-btn');
    if (deleteBtn) {
        deleteBtn.disabled = !currentSite.pitches || currentSite.pitches.length <= 0;
    }
}

function updatePitchSelector() {
    const selector = document.getElementById('pitch-selector');
    if (!selector || !currentSite) return;
    
    selector.innerHTML = '';
    
    if (currentSite.pitches && currentSite.pitches.length > 0) {
        currentSite.pitches.forEach((pitch, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Pitch ${index + 1}: ${PITCH_CONFIGS[pitch.size].name}`;
            if (index === currentPitchIndex) option.selected = true;
            selector.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.value = -1;
        option.textContent = 'No pitches yet';
        selector.appendChild(option);
    }
}

function switchPitch(index) {
    if (!currentSite || !currentSite.pitches[index]) return;
    
    // Save current pitch position before switching
    savePitchPosition();
    
    // Load new pitch
    loadPitchFromSite(index);
}

function addPitchToSite() {
    if (!currentSite) {
        alert('Error: No site loaded');
        return;
    }
    
    // Save current pitch position
    savePitchPosition();
    
    // Go back to pitch selection
    showScreen('pitch-selection');
}

function deletePitchFromSite() {
    if (!currentSite || !currentSite.pitches[currentPitchIndex]) return;
    
    if (confirm(`Delete ${PITCH_CONFIGS[currentSite.pitches[currentPitchIndex].size].name}?`)) {
        currentSite.pitches.splice(currentPitchIndex, 1);
        
        if (currentSite.pitches.length > 0) {
            // Load previous pitch or first pitch
            const newIndex = Math.max(0, currentPitchIndex - 1);
            loadPitchFromSite(newIndex);
        } else {
            // No pitches left, go to pitch selection
            currentPitchIndex = 0;
            showScreen('pitch-selection');
        }
    }
}

function savePitchPosition() {
    if (!currentSite || currentPitchIndex < 0 || !currentSite.pitches[currentPitchIndex]) return;
    
    const pitch = currentSite.pitches[currentPitchIndex];
    
    // Save current position and rotation
    if (currentPitchCenter) {
        pitch.center = {
            lng: currentPitchCenter[0],
            lat: currentPitchCenter[1]
        };
    }
    
    pitch.rotation = currentRotation;
    pitch.modified = new Date().toISOString();
}

function saveSiteChanges() {
    if (!currentSite) {
        alert('No site to save');
        return;
    }
    
    // Save current pitch position
    savePitchPosition();
    
    // If this is a new unsaved site, prompt for name
    if (currentSite.isNewUnsaved) {
        const defaultName = currentSite.location.address || 'New Site';
        let siteName = prompt('Name your site:', defaultName);
        
        // If user cancels, don't save
        if (!siteName || siteName.trim() === '') {
            return;
        }
        
        // Update site name and remove the flag
        currentSite.name = siteName.trim();
        delete currentSite.isNewUnsaved;
    }
    
    // Save to localStorage
    const success = saveSiteToStorage(currentSite);
    
    if (success) {
        alert('Site saved successfully!');
        updateSiteUI(); // Update UI to show new name
    } else {
        alert('Error saving site. Please try again.');
    }
}

function renameSite() {
    if (!currentSite) return;
    
    const currentName = currentSite.name;
    const newName = prompt('Rename site:', currentName);
    
    // If user cancels or enters empty string, don't change
    if (!newName || newName.trim() === '') {
        return;
    }
    
    // Update site name
    currentSite.name = newName.trim();
    currentSite.modified = new Date().toISOString();
    
    // If this was an unsaved site, remove the flag since they've named it
    if (currentSite.isNewUnsaved) {
        delete currentSite.isNewUnsaved;
    }
    
    // Update UI
    updateSiteUI();
    
    // Auto-save the change
    saveSiteToStorage(currentSite);
}

function beginMarking() {
    if (!currentSite) {
        alert('Please create or load a site first');
        showScreen('home');
        return;
    }
    
    if (!currentSite.pitches || currentSite.pitches.length === 0) {
        alert('Please add at least one pitch to the site first');
        showScreen('pitch-selection');
        return;
    }
    
    // Check if site has been saved
    const sites = getSavedSites();
    const isSaved = sites.some(s => s.name === currentSite.name && s.created === currentSite.created);
    
    if (!isSaved) {
        if (confirm('Site not saved. Save before marking?')) {
            saveSiteChanges();
        }
    } else {
        // Auto-save current changes
        savePitchPosition();
        saveSiteToStorage(currentSite);
    }
    
    // Lock position and start marking
    lockPositionAndGenerateWaypoints();
}

// ==================== INITIALIZATION ====================

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== Pitch Marker Pro Initialized ===');
    
    // Home screen buttons
    document.getElementById('new-site-btn')?.addEventListener('click', () => {
        showScreen('location-selection');
    });
    
    document.getElementById('load-site-btn')?.addEventListener('click', () => {
        loadSitesListScreen();
    });
    
    // Location selection buttons
    document.getElementById('back-to-home')?.addEventListener('click', () => {
        showScreen('home');
    });
    
    document.getElementById('use-gps-btn')?.addEventListener('click', () => {
        useGPSLocation();
    });
    
    document.getElementById('search-location-btn')?.addEventListener('click', () => {
        searchPostcode();
    });
    
    document.getElementById('postcode-search')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchPostcode();
    });
    
    // Load site selection
    document.getElementById('back-to-home-from-load')?.addEventListener('click', () => {
        showScreen('home');
    });
    
    // Map screen - Site management buttons
    document.getElementById('pitch-selector')?.addEventListener('change', (e) => {
        const index = parseInt(e.target.value);
        if (index >= 0) {
            switchPitch(index);
        }
    });
    
    document.getElementById('add-pitch-btn')?.addEventListener('click', () => {
        addPitchToSite();
    });
    
    document.getElementById('delete-pitch-btn')?.addEventListener('click', () => {
        deletePitchFromSite();
    });
    
    document.getElementById('save-site-btn')?.addEventListener('click', () => {
        saveSiteChanges();
    });
    
    document.getElementById('begin-marking-btn')?.addEventListener('click', () => {
        beginMarking();
    });
    
    document.getElementById('edit-site-name-btn')?.addEventListener('click', () => {
        renameSite();
    });
    
    // Initialize pitch selection
    initPitchSelection();
    checkGPSPermission();
    
    console.log('=== Initialization complete ===');
});

// Step 1: Pitch Selection
function initPitchSelection() {
    console.log('=== initPitchSelection called ===');
    const pitchButtons = document.querySelectorAll('.pitch-btn');
    console.log('Found pitch buttons:', pitchButtons.length);
    
    pitchButtons.forEach((btn, index) => {
        console.log(`Attaching listener to button ${index}:`, btn.dataset.size);
        btn.addEventListener('click', () => {
            console.log('Button clicked:', btn.dataset.size);
            const size = btn.dataset.size;
            if (size === 'custom') {
                alert('Custom pitch sizes coming soon!');
                return;
            }
            selectPitch(size);
        });
    });
    console.log('=== initPitchSelection complete ===');
}

function selectPitch(size) {
    if (!currentSite) {
        alert('Error: No site selected. Please start from home screen.');
        showScreen('home');
        return;
    }
    
    currentPitchConfig = PITCH_CONFIGS[size];
    
    // Store current map center if map exists (when adding additional pitches)
    let preservedCenter = null;
    let preservedZoom = null;
    if (map) {
        preservedCenter = map.getCenter();
        preservedZoom = map.getZoom();
    }
    
    // Add pitch to site
    const newPitch = {
        size: size,
        config: currentPitchConfig,
        center: preservedCenter ? {lng: preservedCenter.lng, lat: preservedCenter.lat} : currentSite.location,
        rotation: 0,
        added: new Date().toISOString()
    };
    
    currentSite.pitches.push(newPitch);
    currentPitchIndex = currentSite.pitches.length - 1;
    
    // Set current pitch center to preserved center or site center
    currentPitchCenter = preservedCenter ? [preservedCenter.lng, preservedCenter.lat] : [currentSite.location.lng, currentSite.location.lat];
    
    // Reset state for new pitch
    currentRotation = 0;
    positionMode = 'center';
    lockedCorner = null;
    
    showScreen('map-overlay');
    
    // Reset UI controls AFTER screen is shown (with null checks)
    setTimeout(() => {
        const rotationSlider = document.getElementById('rotation-slider');
        const rotationInput = document.getElementById('rotation-input');
        const cornerLockToggle = document.getElementById('corner-lock-toggle');
        const cornerOptionsMini = document.getElementById('corner-options-mini');
        
        if (rotationSlider) rotationSlider.value = 0;
        if (rotationInput) rotationInput.value = 0;
        if (cornerLockToggle) {
            cornerLockToggle.checked = false;
            if (cornerOptionsMini) cornerOptionsMini.classList.remove('active');
        }
    }, 0);
    
    // If map already exists, just update it instead of reinitializing
    if (map && preservedCenter) {
        // Restore the view position
        map.setCenter([preservedCenter.lng, preservedCenter.lat]);
        map.setZoom(preservedZoom);
        
        // Update UI and overlays
        updateSiteUI();
        pitchCorners = calculatePitchCorners(currentPitchCenter, currentPitchConfig, currentRotation);
        updateAllPitchOverlays();
    } else {
        // First pitch or map doesn't exist - initialize
        initMap();
    }
}

// Step 2: Map and Overlay
function initMap() {
    // Check if map container exists before initializing
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found - cannot initialize map');
        alert('⚠️ Error: Map container not found.\n\nThis usually means you\'re not on the map screen yet.\n\nPlease select a pitch size first.');
        return;
    }
    
    // If map already exists, remove it first
    if (map) {
        console.log('Removing existing map...');
        map.remove();
        map = null;
        pitchCorners = null;
        currentPitchCenter = null;
        lockedCorner = null;
        userLocationMarker = null; // Reset user location marker
    }
    
    // Check if Mapbox token is set
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN.includes('test_token') || MAPBOX_TOKEN.includes('YOUR')) {
        console.error('Mapbox token not configured');
        alert('⚠️ Mapbox Token Required\n\nPlease get a free token from mapbox.com and add it to app.js line 12.\n\nSee README.md for instructions.');
        return;
    }
    
    try {
        mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/satellite-v9',
        center: currentSite ? [currentSite.location.lng, currentSite.location.lat] : [-0.1276, 51.5074],
        zoom: 17,
        pitch: 0
    });
    
    map.on('load', () => {
        console.log('Map loaded');
        
        // Ensure map is properly sized (fixes issue when initialized before container is visible)
        setTimeout(() => {
            map.resize();
            console.log('Map resized to fit container');
        }, 100);
        
        // Update site UI
        updateSiteUI();
        
        // If we have a site and pitch center, use that
        if (currentPitchCenter) {
            map.setCenter(currentPitchCenter);
            createPitchOverlay(currentPitchCenter);
            startGPSTracking();
        } else if (currentSite) {
            // Use site location
            const center = [currentSite.location.lng, currentSite.location.lat];
            map.setCenter(center);
            createPitchOverlay(center);
            startGPSTracking();
        } else {
            // Try to get user's location for initial map position
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        console.log('GPS position received:', latitude, longitude);
                        map.setCenter([longitude, latitude]);
                        createPitchOverlay([longitude, latitude]);
                        startGPSTracking();
                    },
                    (error) => {
                        console.error('Error getting location:', error);
                        createPitchOverlay(map.getCenter().toArray());
                        document.getElementById('gps-status').textContent = 
                            '⚠️ GPS permission denied - tap map to place pitch';
                    },
                    { 
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0 
                    }
                );
            }
        }
    });
    
    // Rotation control - slider
    document.getElementById('rotation-slider').addEventListener('input', (e) => {
        currentRotation = parseInt(e.target.value);
        document.getElementById('rotation-input').value = currentRotation;
        
        // Update current pitch in site
        if (currentSite && currentSite.pitches[currentPitchIndex]) {
            currentSite.pitches[currentPitchIndex].rotation = currentRotation;
        }
        
        updatePitchOverlay();
    });
    
    // Rotation control - text input
    document.getElementById('rotation-input').addEventListener('input', (e) => {
        let value = parseInt(e.target.value) || 0;
        value = Math.max(0, Math.min(359, value)); // Clamp between 0-359
        currentRotation = value;
        document.getElementById('rotation-slider').value = currentRotation;
        e.target.value = currentRotation;
        
        // Update current pitch in site
        if (currentSite && currentSite.pitches[currentPitchIndex]) {
            currentSite.pitches[currentPitchIndex].rotation = currentRotation;
        }
        
        updatePitchOverlay();
    });
    
    // Corner Lock Toggle
    const cornerLockToggle = document.getElementById('corner-lock-toggle');
    const cornerOptionsMini = document.getElementById('corner-options-mini');
    
    if (cornerLockToggle) {
        cornerLockToggle.addEventListener('change', (e) => {
            const isLocked = e.target.checked;
            positionMode = isLocked ? 'corner' : 'center';
            
            console.log('Corner lock changed to:', positionMode);
            
            if (isLocked) {
                cornerOptionsMini.classList.add('active');
                
                if (currentLocation) {
                    // Lock corner to current GPS location
                    lockedCorner = [currentLocation.lng, currentLocation.lat];
                    const center = calculateCenterFromCorner(lockedCorner, currentPitchConfig, currentRotation, lockedCornerType);
                    pitchCorners = calculatePitchCorners(center, currentPitchConfig, currentRotation);
                    updatePitchOverlay();
                }
            } else {
                cornerOptionsMini.classList.remove('active');
                lockedCorner = null;
            }
        });
    }
    
    // Corner selection buttons (mini version)
    document.querySelectorAll('.corner-btn-mini').forEach(btn => {
        btn.addEventListener('click', () => {
            const corner = btn.dataset.corner;
            lockedCornerType = corner;
            
            // Update active state
            document.querySelectorAll('.corner-btn-mini').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (positionMode === 'corner' && lockedCorner) {
                const center = calculateCenterFromCorner(lockedCorner, currentPitchConfig, currentRotation, lockedCornerType);
                pitchCorners = calculatePitchCorners(center, currentPitchConfig, currentRotation);
                updatePitchOverlay();
            }
        });
    });
    
    // Set default corner button as active
    const defaultCornerBtn = document.querySelector('.corner-btn-mini[data-corner="bottom-left"]');
    if (defaultCornerBtn) {
        defaultCornerBtn.classList.add('active');
    }
    
    // REMOVED: Swipeable panel logic - UI simplified
    
    // Allow user to tap map to reposition pitch (center mode only)
    map.on('click', (e) => {
        if (positionMode === 'center') {
            const center = [e.lngLat.lng, e.lngLat.lat];
            createPitchOverlay(center);
        }
    });
    
    } catch (error) {
        console.error('Map initialization error:', error);
        alert('⚠️ Map Error\n\n' + error.message + '\n\nPlease check:\n1. Mapbox token is valid\n2. Internet connection is working\n3. Browser console for details');
        // Go back to pitch selection on error
        showScreen('pitch-selection');
    }
}

function createPitchOverlay(center) {
    currentPitchCenter = center; // Store the center position
    pitchCorners = calculatePitchCorners(center, currentPitchConfig, currentRotation);
    
    // Update current pitch in site
    if (currentSite && currentSite.pitches[currentPitchIndex]) {
        currentSite.pitches[currentPitchIndex].center = {
            lng: center[0],
            lat: center[1]
        };
    }
    
    updatePitchOverlay();
}

function calculateCenterFromCorner(cornerLngLat, config, rotation, cornerType) {
    // Given a corner position, calculate center based on which corner it is
    const lengthMeters = config.length * YARDS_TO_METERS;
    const widthMeters = config.width * YARDS_TO_METERS;
    const rotRad = (rotation * Math.PI) / 180;
    
    // Define offset multipliers for each corner type
    const offsets = {
        'bottom-left': { lengthMult: 0.5, widthMult: 0.5 },
        'bottom-right': { lengthMult: -0.5, widthMult: 0.5 },
        'top-right': { lengthMult: -0.5, widthMult: -0.5 },
        'top-left': { lengthMult: 0.5, widthMult: -0.5 }
    };
    
    const offset = offsets[cornerType];
    
    // Offset from corner to center
    const halfLength = lengthMeters * offset.lengthMult;
    const halfWidth = widthMeters * offset.widthMult;
    
    // Apply rotation
    const dx = halfLength * Math.cos(rotRad) - halfWidth * Math.sin(rotRad);
    const dy = halfLength * Math.sin(rotRad) + halfWidth * Math.cos(rotRad);
    
    // Convert to lat/lng offset
    const centerLat = cornerLngLat[1] + (dy / 111320);
    const centerLng = cornerLngLat[0] + (dx / (111320 * Math.cos(cornerLngLat[1] * Math.PI / 180)));
    
    return [centerLng, centerLat];
}

function calculatePitchCorners(center, config, rotation) {
    const [centerLng, centerLat] = center;
    const lengthMeters = config.length * YARDS_TO_METERS;
    const widthMeters = config.width * YARDS_TO_METERS;
    
    // Convert rotation to radians
    const rotRad = (rotation * Math.PI) / 180;
    
    // Half dimensions
    const halfLength = lengthMeters / 2;
    const halfWidth = widthMeters / 2;
    
    // Calculate corners relative to center, then rotate
    const corners = [
        [-halfLength, -halfWidth], // Bottom-left (corner 1)
        [halfLength, -halfWidth],  // Bottom-right (corner 2)
        [halfLength, halfWidth],   // Top-right (corner 3)
        [-halfLength, halfWidth]   // Top-left (corner 4)
    ];
    
    // Rotate and convert to lat/lng
    return corners.map(([x, y]) => {
        const rotX = x * Math.cos(rotRad) - y * Math.sin(rotRad);
        const rotY = x * Math.sin(rotRad) + y * Math.cos(rotRad);
        
        return metersToLatLng(centerLat, centerLng, rotX, rotY);
    });
}

function metersToLatLng(lat, lng, dx, dy) {
    const newLat = lat + (dy / 111320);
    const newLng = lng + (dx / (111320 * Math.cos(lat * Math.PI / 180)));
    return [newLng, newLat];
}

function updatePitchOverlay() {
    // Recalculate center and corners based on mode
    if (positionMode === 'corner' && lockedCorner) {
        // Corner mode: calculate center from locked corner
        currentPitchCenter = calculateCenterFromCorner(lockedCorner, currentPitchConfig, currentRotation, lockedCornerType);
        
        // Save to current pitch in site
        if (currentSite && currentSite.pitches[currentPitchIndex]) {
            currentSite.pitches[currentPitchIndex].center = {
                lng: currentPitchCenter[0],
                lat: currentPitchCenter[1]
            };
        }
    }
    
    // Recalculate corners with current center and rotation (works for both modes)
    if (currentPitchCenter) {
        pitchCorners = calculatePitchCorners(currentPitchCenter, currentPitchConfig, currentRotation);
    }
    
    // Update all pitch overlays
    updateAllPitchOverlays();
}

function updateAllPitchOverlays() {
    if (!map || !currentSite) return;
    
    // Build FeatureCollection with all pitches
    const features = [];
    
    if (currentSite.pitches) {
        currentSite.pitches.forEach((pitch, index) => {
            const isActive = index === currentPitchIndex;
            const config = PITCH_CONFIGS[pitch.size];
            const center = pitch.center ? [pitch.center.lng, pitch.center.lat] : [currentSite.location.lng, currentSite.location.lat];
            const rotation = pitch.rotation || 0;
            
            // Calculate corners for this pitch
            const corners = calculatePitchCorners(center, config, rotation);
            
            // Create polygon (close the loop)
            const coordinates = [[...corners.map(c => c), corners[0]]];
            
            features.push({
                type: 'Feature',
                properties: {
                    pitchIndex: index,
                    isActive: isActive,
                    pitchName: config.name
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: coordinates
                }
            });
        });
    }
    
    const featureCollection = {
        type: 'FeatureCollection',
        features: features
    };
    
    // Update or create the pitch source
    if (map.getSource('pitches')) {
        map.getSource('pitches').setData(featureCollection);
    } else {
        map.addSource('pitches', {
            type: 'geojson',
            data: featureCollection
        });
        
        // Add fill layer with conditional styling
        map.addLayer({
            id: 'pitches-fill',
            type: 'fill',
            source: 'pitches',
            paint: {
                'fill-color': [
                    'case',
                    ['get', 'isActive'],
                    '#4CAF50',  // Active pitch - bright green
                    '#888888'   // Inactive pitches - gray
                ],
                'fill-opacity': [
                    'case',
                    ['get', 'isActive'],
                    0.4,        // Active pitch - more opaque
                    0.2         // Inactive pitches - more transparent
                ]
            }
        });
        
        // Add outline layer with conditional styling
        map.addLayer({
            id: 'pitches-outline',
            type: 'line',
            source: 'pitches',
            paint: {
                'line-color': [
                    'case',
                    ['get', 'isActive'],
                    '#4CAF50',  // Active pitch - bright green
                    '#AAAAAA'   // Inactive pitches - light gray
                ],
                'line-width': [
                    'case',
                    ['get', 'isActive'],
                    3,          // Active pitch - thicker
                    2           // Inactive pitches - thinner
                ]
            }
        });
        
        // Enable drag interaction for pitches
        setupPitchDragHandlers();
    }
    
    // Remove old single-pitch layers if they exist
    if (map.getLayer('pitch-fill')) {
        map.removeLayer('pitch-fill');
    }
    if (map.getLayer('pitch-outline')) {
        map.removeLayer('pitch-outline');
    }
    if (map.getSource('pitch')) {
        map.removeSource('pitch');
    }
}

// ==================== PITCH DRAG FUNCTIONALITY ====================

let isDraggingPitch = false;
let draggedPitchIndex = null;

function setupPitchDragHandlers() {
    // Change cursor on hover over any pitch (desktop)
    map.on('mouseenter', 'pitches-fill', () => {
        map.getCanvas().style.cursor = 'move';
    });
    
    map.on('mouseleave', 'pitches-fill', () => {
        if (!isDraggingPitch) {
            map.getCanvas().style.cursor = '';
        }
    });
    
    // Handle pitch click/drag (desktop)
    map.on('mousedown', 'pitches-fill', (e) => {
        if (!e.features || !e.features[0]) return;
        
        // Get which pitch was clicked
        const pitchIndex = e.features[0].properties.pitchIndex;
        
        // If clicking a different pitch, switch to it
        if (pitchIndex !== currentPitchIndex) {
            switchPitch(pitchIndex);
            return;
        }
        
        // Start dragging current pitch
        e.preventDefault();
        isDraggingPitch = true;
        draggedPitchIndex = pitchIndex;
        map.getCanvas().style.cursor = 'grabbing';
        
        // Disable map dragging while dragging pitch
        map.dragPan.disable();
        
        // Listen for mouse movement
        map.on('mousemove', onPitchDrag);
        map.once('mouseup', onPitchDragEnd);
    });
    
    // Touch support for mobile
    map.on('touchstart', 'pitches-fill', (e) => {
        if (!e.features || !e.features[0]) return;
        
        const pitchIndex = e.features[0].properties.pitchIndex;
        
        // If touching a different pitch, switch to it
        if (pitchIndex !== currentPitchIndex) {
            switchPitch(pitchIndex);
            return;
        }
        
        // Start dragging current pitch
        e.preventDefault();
        isDraggingPitch = true;
        draggedPitchIndex = pitchIndex;
        
        // Disable map dragging while dragging pitch
        map.dragPan.disable();
        map.touchZoomRotate.disable();
        
        // Listen for touch movement
        map.on('touchmove', onPitchDragTouch);
        map.once('touchend', onPitchDragEndTouch);
    });
}

function onPitchDrag(e) {
    if (!isDraggingPitch || draggedPitchIndex === null) return;
    
    // Update pitch center to mouse position
    const newCenter = [e.lngLat.lng, e.lngLat.lat];
    currentPitchCenter = newCenter;
    
    // Update in site
    if (currentSite && currentSite.pitches[draggedPitchIndex]) {
        currentSite.pitches[draggedPitchIndex].center = {
            lng: newCenter[0],
            lat: newCenter[1]
        };
    }
    
    // Recalculate corners
    pitchCorners = calculatePitchCorners(newCenter, currentPitchConfig, currentRotation);
    
    // Re-render all pitches
    updateAllPitchOverlays();
}

function onPitchDragTouch(e) {
    if (!isDraggingPitch || draggedPitchIndex === null) return;
    if (!e.lngLat) return;
    
    // Update pitch center to touch position
    const newCenter = [e.lngLat.lng, e.lngLat.lat];
    currentPitchCenter = newCenter;
    
    // Update in site
    if (currentSite && currentSite.pitches[draggedPitchIndex]) {
        currentSite.pitches[draggedPitchIndex].center = {
            lng: newCenter[0],
            lat: newCenter[1]
        };
    }
    
    // Recalculate corners
    pitchCorners = calculatePitchCorners(newCenter, currentPitchConfig, currentRotation);
    
    // Re-render all pitches
    updateAllPitchOverlays();
}

function onPitchDragEnd() {
    isDraggingPitch = false;
    draggedPitchIndex = null;
    map.getCanvas().style.cursor = 'move';
    
    // Re-enable map dragging
    map.dragPan.enable();
    
    // Remove mousemove listener
    map.off('mousemove', onPitchDrag);
}

function onPitchDragEndTouch() {
    isDraggingPitch = false;
    draggedPitchIndex = null;
    
    // Re-enable map interaction
    map.dragPan.enable();
    map.touchZoomRotate.enable();
    
    // Remove touchmove listener
    map.off('touchmove', onPitchDragTouch);
}

function startGPSTracking() {
    if (!navigator.geolocation) {
        alert('GPS not supported on this device');
        return;
    }
    
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading
            };
            
            updateGPSIndicator(currentLocation);
            updateUserMarker(currentLocation);
        },
        (error) => {
            console.error('GPS error:', error);
            document.getElementById('gps-status').textContent = '🔴 GPS Error';
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

function updateGPSIndicator(location) {
    const status = document.getElementById('gps-status');
    const accuracy = document.getElementById('gps-accuracy');
    
    if (location.accuracy < 5) {
        status.textContent = '🟢 GPS: Excellent';
    } else if (location.accuracy < 10) {
        status.textContent = '🟡 GPS: Good';
    } else {
        status.textContent = '🟠 GPS: Fair';
    }
    
    accuracy.textContent = `±${location.accuracy.toFixed(1)}m`;
}

function updateUserMarker(location) {
    if (!map) return;
    
    if (userLocationMarker) {
        userLocationMarker.setLngLat([location.lng, location.lat]);
    } else {
        const el = document.createElement('div');
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#2196F3';
        el.style.border = '3px solid white';
        
        userLocationMarker = new mapboxgl.Marker(el)
            .setLngLat([location.lng, location.lat])
            .addTo(map);
    }
    
    // If in corner mode, update locked corner to current GPS position
    if (positionMode === 'corner' && lockedCorner) {
        lockedCorner = [location.lng, location.lat];
        updatePitchOverlay();
    }
}

// Step 3: Lock Position and Generate Waypoints
function lockPositionAndGenerateWaypoints() {
    if (!pitchCorners) {
        alert('Please wait for pitch to be positioned');
        return;
    }
    
    waypoints = generateWaypoints(pitchCorners, currentPitchConfig, currentRotation);
    currentWaypointIndex = 0;
    markedPoints = [];
    
    showScreen('navigation');
    initNavigation();
}

function generateWaypoints(corners, config, rotation) {
    const points = [];
    
    // 1-4: Corners
    points.push({ name: 'Corner 1 (Bottom-Left)', lat: corners[0][1], lng: corners[0][0], type: 'corner' });
    points.push({ name: 'Corner 2 (Bottom-Right)', lat: corners[1][1], lng: corners[1][0], type: 'corner' });
    points.push({ name: 'Corner 3 (Top-Right)', lat: corners[2][1], lng: corners[2][0], type: 'corner' });
    points.push({ name: 'Corner 4 (Top-Left)', lat: corners[3][1], lng: corners[3][0], type: 'corner' });
    
    // 5-6: Halfway line endpoints (on sidelines, not goal lines)
    const halfwayBottom = midpointBetween(corners[0], corners[1]); // Bottom sideline midpoint
    const halfwayTop = midpointBetween(corners[2], corners[3]);    // Top sideline midpoint
    points.push({ name: 'Halfway Line (Bottom)', lat: halfwayBottom[1], lng: halfwayBottom[0], type: 'halfway' });
    points.push({ name: 'Halfway Line (Top)', lat: halfwayTop[1], lng: halfwayTop[0], type: 'halfway' });
    
    // 7-10: Penalty area corners (these are actually goal areas for 5v5 and 7v7)
    const penaltyPoints = calculateBoxCorners(corners, config.penaltyAreaLength, config.penaltyAreaWidth, rotation);
    points.push({ name: 'Left Penalty Area (Bottom)', lat: penaltyPoints.left.bottom[1], lng: penaltyPoints.left.bottom[0], type: 'penalty' });
    points.push({ name: 'Left Penalty Area (Top)', lat: penaltyPoints.left.top[1], lng: penaltyPoints.left.top[0], type: 'penalty' });
    points.push({ name: 'Right Penalty Area (Bottom)', lat: penaltyPoints.right.bottom[1], lng: penaltyPoints.right.bottom[0], type: 'penalty' });
    points.push({ name: 'Right Penalty Area (Top)', lat: penaltyPoints.right.top[1], lng: penaltyPoints.right.top[0], type: 'penalty' });
    
    // 11-14: Goal area corners (6-yard box) - only for pitches that have them (9v9, 11v11)
    if (config.goalAreaLength > 0 && config.goalAreaWidth > 0) {
        const goalPoints = calculateBoxCorners(corners, config.goalAreaLength, config.goalAreaWidth, rotation);
        points.push({ name: 'Left Goal Area (Bottom)', lat: goalPoints.left.bottom[1], lng: goalPoints.left.bottom[0], type: 'goal' });
        points.push({ name: 'Left Goal Area (Top)', lat: goalPoints.left.top[1], lng: goalPoints.left.top[0], type: 'goal' });
        points.push({ name: 'Right Goal Area (Bottom)', lat: goalPoints.right.bottom[1], lng: goalPoints.right.bottom[0], type: 'goal' });
        points.push({ name: 'Right Goal Area (Top)', lat: goalPoints.right.top[1], lng: goalPoints.right.top[0], type: 'goal' });
    }
    
    return points;
}

function calculateBoxCorners(corners, depth, width, rotation) {
    // Calculate the inner box corners (penalty area or goal area)
    // corners: [bottom-left, bottom-right, top-right, top-left]
    // depth: distance from goal line inward (in yards)
    // width: width of the box (in yards)
    
    const depthMeters = depth * YARDS_TO_METERS;
    const widthMeters = width * YARDS_TO_METERS;
    const halfWidth = widthMeters / 2;
    
    const rotRad = (rotation * Math.PI) / 180;
    
    // Left goal line center
    const leftGoalCenter = midpointBetween(corners[0], corners[3]);
    
    // Right goal line center  
    const rightGoalCenter = midpointBetween(corners[1], corners[2]);
    
    // For left side (goal at left):
    // - Move inward (to the right) by depth
    // - Move up/down by halfWidth
    const leftInwardDx = depthMeters * Math.cos(rotRad);
    const leftInwardDy = depthMeters * Math.sin(rotRad);
    
    const leftWidthDx = halfWidth * Math.sin(rotRad);
    const leftWidthDy = -halfWidth * Math.cos(rotRad);
    
    const leftBottom = offsetPoint(leftGoalCenter, leftInwardDx - leftWidthDx, leftInwardDy - leftWidthDy);
    const leftTop = offsetPoint(leftGoalCenter, leftInwardDx + leftWidthDx, leftInwardDy + leftWidthDy);
    
    // For right side (goal at right):
    // - Move inward (to the left) by depth
    const rightInwardDx = -depthMeters * Math.cos(rotRad);
    const rightInwardDy = -depthMeters * Math.sin(rotRad);
    
    const rightBottom = offsetPoint(rightGoalCenter, rightInwardDx - leftWidthDx, rightInwardDy - leftWidthDy);
    const rightTop = offsetPoint(rightGoalCenter, rightInwardDx + leftWidthDx, rightInwardDy + leftWidthDy);
    
    return {
        left: { bottom: leftBottom, top: leftTop },
        right: { bottom: rightBottom, top: rightTop }
    };
}

function offsetPoint(point, dxMeters, dyMeters) {
    // Convert meter offsets to lat/lng
    const lat = point[1] + (dyMeters / 111320);
    const lng = point[0] + (dxMeters / (111320 * Math.cos(point[1] * Math.PI / 180)));
    return [lng, lat];
}

function midpointBetween(point1, point2) {
    return [
        (point1[0] + point2[0]) / 2,
        (point1[1] + point2[1]) / 2
    ];
}

// Step 4: Navigation
function initNavigation() {
    renderPitchDiagram(); // Add pitch diagram
    updateWaypointDisplay();
    updateNavigationUI();
    startNavigationTracking();
    updateMarkingPitchSelector(); // Populate pitch selector
    
    document.getElementById('exit-navigation').addEventListener('click', () => {
        if (confirm('Exit marking? Progress will be lost.')) {
            navigator.geolocation.clearWatch(watchId);
            showScreen('map-overlay');
            
            // Resize map to ensure it fills the screen properly
            if (map) {
                setTimeout(() => {
                    map.resize();
                    console.log('Map resized after exiting navigation');
                }, 100);
            }
        }
    });
    
    // Marking pitch selector - switch pitch during marking
    document.getElementById('marking-pitch-selector')?.addEventListener('change', (e) => {
        const newIndex = parseInt(e.target.value);
        if (newIndex >= 0 && currentSite && currentSite.pitches[newIndex]) {
            switchMarkingPitch(newIndex);
        }
    });
    
    document.getElementById('mark-point').addEventListener('click', () => {
        markCurrentPoint();
    });
    
    document.getElementById('finish-marking').addEventListener('click', () => {
        finishMarking();
    });
}

function updateMarkingPitchSelector() {
    const selector = document.getElementById('marking-pitch-selector');
    if (!selector || !currentSite) return;
    
    selector.innerHTML = '';
    
    if (currentSite.pitches && currentSite.pitches.length > 0) {
        currentSite.pitches.forEach((pitch, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Pitch ${index + 1}: ${PITCH_CONFIGS[pitch.size].name}`;
            if (index === currentPitchIndex) option.selected = true;
            selector.appendChild(option);
        });
    }
}

function switchMarkingPitch(newIndex) {
    if (!currentSite || !currentSite.pitches[newIndex]) return;
    
    // Confirm switch if already marked some points
    if (markedPoints.length > 0) {
        if (!confirm('Switch pitch? Current marking progress will be lost.')) {
            // Reset selector to current pitch
            document.getElementById('marking-pitch-selector').value = currentPitchIndex;
            return;
        }
    }
    
    // Switch to new pitch
    const pitch = currentSite.pitches[newIndex];
    currentPitchIndex = newIndex;
    currentPitchConfig = PITCH_CONFIGS[pitch.size];
    currentRotation = pitch.rotation || 0;
    currentPitchCenter = pitch.center ? [pitch.center.lng, pitch.center.lat] : [currentSite.location.lng, currentSite.location.lat];
    
    // Recalculate corners and waypoints
    pitchCorners = calculatePitchCorners(currentPitchCenter, currentPitchConfig, currentRotation);
    waypoints = generateWaypoints(pitchCorners, currentPitchConfig, currentRotation);
    currentWaypointIndex = 0;
    markedPoints = [];
    
    // Update UI
    renderPitchDiagram();
    updateWaypointDisplay();
    updateNavigationUI();
}

function renderPitchDiagram() {
    const markersGroup = document.getElementById('waypoint-markers');
    markersGroup.innerHTML = '';
    
    // Update dimension labels based on current pitch config
    updateDimensionLabels();
    
    // Show/hide goal area boxes based on pitch config
    const goalAreaBoxes = document.getElementById('goal-area-boxes');
    if (goalAreaBoxes) {
        goalAreaBoxes.style.display = 
            (currentPitchConfig && currentPitchConfig.goalAreaLength > 0) ? 'block' : 'none';
    }
    
    // Define SVG positions for waypoints (matching pitch diagram layout)
    // SVG viewBox is 220x160, pitch is from (20,20) to (200,140)
    // Pitch dimensions: 180 wide x 120 tall
    const positions = [
        { x: 20, y: 140, label: '1' },     // Corner 1 (Bottom-Left)
        { x: 200, y: 140, label: '2' },    // Corner 2 (Bottom-Right)
        { x: 200, y: 20, label: '3' },     // Corner 3 (Top-Right)
        { x: 20, y: 20, label: '4' },      // Corner 4 (Top-Left)
        { x: 110, y: 140, label: 'H1' },   // Halfway Line (Bottom)
        { x: 110, y: 20, label: 'H2' },    // Halfway Line (Top)
        { x: 45, y: 110, label: 'P1' },    // Left Penalty (Bottom)
        { x: 45, y: 50, label: 'P2' },     // Left Penalty (Top)
        { x: 175, y: 110, label: 'P3' },   // Right Penalty (Bottom)
        { x: 175, y: 50, label: 'P4' },    // Right Penalty (Top)
        { x: 32, y: 95, label: 'G1' },     // Left Goal Area (Bottom)
        { x: 32, y: 65, label: 'G2' },     // Left Goal Area (Top)
        { x: 188, y: 95, label: 'G3' },    // Right Goal Area (Bottom)
        { x: 188, y: 65, label: 'G4' }     // Right Goal Area (Top)
    ];
    
    waypoints.forEach((wp, index) => {
        if (index >= positions.length) return;
        
        const pos = positions[index];
        
        // Check if this waypoint has been marked
        const isMarked = markedPoints.some(mp => mp.waypoint.name === wp.name);
        const isCurrent = index === currentWaypointIndex;
        
        const status = isMarked ? 'completed' :
                      isCurrent ? 'current' : 'incomplete';
        
        // Create circle marker
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('r', '5');
        circle.classList.add('waypoint-marker', status);
        circle.setAttribute('data-index', index);
        
        // Add click handler (only if not completed)
        if (!isMarked) {
            circle.addEventListener('click', () => {
                navigateToWaypoint(index);
            });
            circle.style.cursor = 'pointer';
        } else {
            circle.style.cursor = 'default';
        }
        
        // Create label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x);
        text.setAttribute('y', pos.y + 3);
        text.classList.add('waypoint-label');
        text.textContent = pos.label;
        
        markersGroup.appendChild(circle);
        markersGroup.appendChild(text);
    });
}

function updateDimensionLabels() {
    if (!currentPitchConfig) return;
    
    // Update pitch dimensions
    document.getElementById('pitch-length-label').textContent = currentPitchConfig.length + ' yds';
    document.getElementById('pitch-width-label').textContent = currentPitchConfig.width + ' yds';
    
    // Update penalty area dimensions
    document.getElementById('penalty-length-label').textContent = currentPitchConfig.penaltyAreaLength + 'y';
    
    // Update goal area dimensions (hide if not present)
    const goalLabel = document.getElementById('goal-length-label');
    const goalLine = goalLabel.previousElementSibling; // The line element before the text
    const goalEndMarkers = goalLine.previousElementSibling.previousElementSibling; // The end marker lines
    
    if (currentPitchConfig.goalAreaLength > 0) {
        goalLabel.textContent = currentPitchConfig.goalAreaLength + 'y';
        goalLabel.style.display = 'block';
        if (goalLine) goalLine.style.display = 'block';
        if (goalEndMarkers) goalEndMarkers.style.display = 'block';
    } else {
        goalLabel.style.display = 'none';
        if (goalLine) goalLine.style.display = 'none';
        if (goalEndMarkers) goalEndMarkers.style.display = 'none';
    }
    
    // Update reference labels (penalty spot and center circle)
    const penaltySpotLabel = document.getElementById('penalty-spot-label');
    const centerCircleLabel = document.getElementById('center-circle-label');
    
    if (penaltySpotLabel) {
        penaltySpotLabel.textContent = `${currentPitchConfig.penaltySpotDistance}y`;
    }
    
    if (centerCircleLabel) {
        centerCircleLabel.textContent = `${currentPitchConfig.centerCircleRadius}y`;
    }
}

function navigateToWaypoint(index) {
    // Check if waypoint is already completed
    const isMarked = markedPoints.some(mp => mp.waypoint.name === waypoints[index].name);
    
    if (isMarked) {
        // Don't navigate to already completed waypoints
        return;
    }
    
    currentWaypointIndex = index;
    updateWaypointDisplay();
    updateNavigationUI();
}

function updateWaypointDisplay() {
    const checklist = document.getElementById('waypoint-checklist');
    checklist.innerHTML = '';
    
    waypoints.forEach((wp, index) => {
        // Check if this waypoint has been marked
        const isMarked = markedPoints.some(mp => mp.waypoint.name === wp.name);
        const isCurrent = index === currentWaypointIndex;
        
        const li = document.createElement('li');
        li.className = isCurrent ? 'current' : 
                       isMarked ? 'completed' : '';
        
        const status = isMarked ? '✓' : 
                      isCurrent ? '→' : '○';
        
        li.innerHTML = `
            <span>${wp.name}</span>
            <span class="status">${status}</span>
        `;
        
        // Add click handler to navigate to this waypoint (only if not completed)
        if (!isMarked) {
            li.addEventListener('click', () => {
                navigateToWaypoint(index);
            });
        }
        
        checklist.appendChild(li);
    });
    
    // Update pitch diagram to reflect changes
    renderPitchDiagram();
}

function startNavigationTracking() {
    // Update navigation every time GPS position changes
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
    }
    
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading
            };
            
            updateNavigationUI();
        },
        (error) => {
            console.error('GPS error:', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

function updateNavigationUI() {
    if (!currentLocation || currentWaypointIndex >= waypoints.length) return;
    
    const target = waypoints[currentWaypointIndex];
    const distance = calculateDistance(
        currentLocation.lat, currentLocation.lng,
        target.lat, target.lng
    );
    
    const bearing = calculateBearing(
        currentLocation.lat, currentLocation.lng,
        target.lat, target.lng
    );
    
    // Update displays
    document.getElementById('current-waypoint').textContent = target.name;
    document.getElementById('distance').textContent = distance.toFixed(1);
    document.getElementById('nav-accuracy').textContent = currentLocation.accuracy.toFixed(1);
    
    // Update compass arrow
    const arrow = document.getElementById('compass-arrow');
    const heading = currentLocation.heading || 0;
    const relativeBearing = bearing - heading;
    arrow.style.transform = `rotate(${relativeBearing}deg)`;
    
    // Enable/disable mark button based on distance and accuracy
    const markBtn = document.getElementById('mark-point');
    const threshold = Math.max(2, currentLocation.accuracy);
    
    if (distance < threshold) {
        markBtn.disabled = false;
        document.getElementById('waypoint-instruction').textContent = 
            '✓ You\'re close enough! Mark this point.';
    } else {
        markBtn.disabled = true;
        document.getElementById('waypoint-instruction').textContent = 
            `Walk towards the arrow until distance is less than ${threshold.toFixed(1)}m`;
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    
    return (θ * 180 / Math.PI + 360) % 360;
}

function markCurrentPoint() {
    // Mark current waypoint as complete
    markedPoints.push({
        waypoint: waypoints[currentWaypointIndex],
        actualLocation: { ...currentLocation },
        timestamp: new Date()
    });
    
    // Find next incomplete waypoint
    let nextIncomplete = -1;
    for (let i = currentWaypointIndex + 1; i < waypoints.length; i++) {
        // Check if this waypoint is already marked
        const alreadyMarked = markedPoints.some(mp => 
            mp.waypoint.name === waypoints[i].name
        );
        if (!alreadyMarked) {
            nextIncomplete = i;
            break;
        }
    }
    
    if (nextIncomplete === -1) {
        // All points marked
        currentWaypointIndex = waypoints.length;
        document.getElementById('finish-marking').style.display = 'block';
        document.getElementById('mark-point').style.display = 'none';
        document.getElementById('waypoint-instruction').textContent = 
            '🎉 All points marked! Tap "Finish" to save.';
    } else {
        // Navigate to next incomplete waypoint
        currentWaypointIndex = nextIncomplete;
        updateWaypointDisplay();
        updateNavigationUI();
    }
}

function finishMarking() {
    const summary = {
        pitch: currentPitchConfig.name,
        rotation: currentRotation,
        markedPoints: markedPoints,
        completedAt: new Date()
    };
    
    // Save to localStorage
    const saved = JSON.parse(localStorage.getItem('markedPitches') || '[]');
    saved.push(summary);
    localStorage.setItem('markedPitches', JSON.stringify(saved));
    
    alert(`✅ Pitch marked successfully!\n\nAccuracy: Average ${
        (markedPoints.reduce((sum, p) => sum + p.actualLocation.accuracy, 0) / markedPoints.length).toFixed(1)
    }m\n\nAll ${markedPoints.length} points saved.`);
    
    navigator.geolocation.clearWatch(watchId);
    showScreen('pitch-selection');
}

// Utility Functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function checkGPSPermission() {
    if ('permissions' in navigator) {
        navigator.permissions.query({ name: 'geolocation' }).then(result => {
            if (result.state === 'denied') {
                showPermissionAlert();
            }
            
            // Listen for permission changes
            result.addEventListener('change', () => {
                if (result.state === 'granted') {
                    console.log('Location permission granted');
                }
            });
        });
    }
}

function showPermissionAlert() {
    const device = detectDevice();
    let instructions = '';
    
    if (device === 'android') {
        instructions = 'Android: Tap the lock icon in the address bar → Permissions → Location → Allow';
    } else if (device === 'ios') {
        instructions = 'iOS: Settings → Safari → Location → Allow\nOR Settings → Privacy → Location Services → Safari → Allow';
    } else {
        instructions = 'Click the lock icon in the address bar → Site settings → Location → Allow';
    }
    
    alert('⚠️ Location Permission Needed\n\nThis app needs GPS to work.\n\n' + instructions + '\n\nThen refresh this page.');
}

function detectDevice() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) {
        return 'android';
    } else if (/iPad|iPhone|iPod/.test(ua)) {
        return 'ios';
    } else {
        return 'desktop';
    }
}

// Service Worker disabled to prevent caching issues during development
// Uncomment the code below to enable PWA offline functionality:
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}
*/
