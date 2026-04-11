// Google Maps Utilities for Clearline CRM
const MAPS_CONFIG = {
    get apiKey() { return window.CL_SECRETS?.mapsApiKey || ''; },
    loaded: false,
    loading: false
};

// Load Google Maps API dynamically
function loadGoogleMaps() {
    return new Promise((resolve, reject) => {
        if (MAPS_CONFIG.loaded) {
            resolve();
            return;
        }
        
        if (MAPS_CONFIG.loading) {
            // Wait for existing load
            const checkLoaded = setInterval(() => {
                if (MAPS_CONFIG.loaded) {
                    clearInterval(checkLoaded);
                    resolve();
                }
            }, 100);
            return;
        }
        
        MAPS_CONFIG.loading = true;
        
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_CONFIG.apiKey}&libraries=places&callback=onGoogleMapsLoaded`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            MAPS_CONFIG.loading = false;
            reject(new Error('Failed to load Google Maps'));
        };
        
        window.onGoogleMapsLoaded = () => {
            MAPS_CONFIG.loaded = true;
            MAPS_CONFIG.loading = false;
            resolve();
        };
        
        document.head.appendChild(script);
    });
}

// Initialize Places Autocomplete on an input element
function initAddressAutocomplete(inputId, options = {}) {
    return loadGoogleMaps().then(() => {
        const input = document.getElementById(inputId);
        if (!input) {
            console.warn(`Autocomplete input not found: ${inputId}`);
            return null;
        }
        
        const autocomplete = new google.maps.places.Autocomplete(input, {
            types: ['address'],
            componentRestrictions: { country: 'us' },
            fields: ['formatted_address', 'geometry', 'address_components'],
            ...options
        });
        
        // Store coordinates when place is selected
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry) {
                input.dataset.lat = place.geometry.location.lat();
                input.dataset.lng = place.geometry.location.lng();
                input.dataset.formattedAddress = place.formatted_address;
                
                // Trigger custom event
                input.dispatchEvent(new CustomEvent('addressSelected', { 
                    detail: { 
                        address: place.formatted_address,
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng(),
                        components: place.address_components
                    }
                }));
            }
        });
        
        return autocomplete;
    }).catch(err => {
        console.error('Failed to init autocomplete:', err);
        return null;
    });
}

// Get user's current location
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                reject(error);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

// Calculate distance between two points (in miles)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Estimate drive time (rough estimate: 30mph average in suburban areas)
function estimateDriveTime(distanceMiles) {
    const avgSpeedMph = 30;
    const minutes = Math.round((distanceMiles / avgSpeedMph) * 60);
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Get distance and time from user location to destination
async function getDistanceToJob(destLat, destLng) {
    try {
        const userLoc = await getCurrentLocation();
        const distance = calculateDistance(userLoc.lat, userLoc.lng, destLat, destLng);
        const time = estimateDriveTime(distance);
        return {
            distance: distance.toFixed(1),
            time: time,
            userLat: userLoc.lat,
            userLng: userLoc.lng
        };
    } catch (err) {
        console.error('Could not get distance:', err);
        return null;
    }
}

// Geocode an address to get coordinates
function geocodeAddress(address) {
    return loadGoogleMaps().then(() => {
        return new Promise((resolve, reject) => {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address: address }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    resolve({
                        lat: results[0].geometry.location.lat(),
                        lng: results[0].geometry.location.lng(),
                        formattedAddress: results[0].formatted_address
                    });
                } else {
                    reject(new Error('Geocoding failed: ' + status));
                }
            });
        });
    });
}

// Generate Google Maps directions URL for multiple stops
function getMultiStopDirectionsUrl(stops) {
    if (!stops || stops.length === 0) return null;
    
    const origin = encodeURIComponent(stops[0]);
    const destination = encodeURIComponent(stops[stops.length - 1]);
    const waypoints = stops.slice(1, -1).map(s => encodeURIComponent(s)).join('|');
    
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) {
        url += `&waypoints=${waypoints}`;
    }
    url += '&travelmode=driving';
    
    return url;
}

// Generate directions URL from current location to single destination
function getDirectionsUrl(destAddress) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destAddress)}&travelmode=driving`;
}

// Create a basic map
function createMap(containerId, options = {}) {
    return loadGoogleMaps().then(() => {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Map container not found: ${containerId}`);
        }
        
        const defaultOptions = {
            zoom: 10,
            center: { lat: 33.9519, lng: -83.3576 }, // Default to Athens, GA area
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            styles: [
                { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }
            ]
        };
        
        return new google.maps.Map(container, { ...defaultOptions, ...options });
    });
}

// Add a marker to a map
function addMarker(map, lat, lng, options = {}) {
    const marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        ...options
    });
    
    return marker;
}

// Add info window to a marker
function addInfoWindow(map, marker, content) {
    const infoWindow = new google.maps.InfoWindow({ content });
    
    marker.addListener('click', () => {
        infoWindow.open(map, marker);
    });
    
    return infoWindow;
}

// Fit map bounds to show all markers
function fitMapToMarkers(map, markers) {
    if (!markers || markers.length === 0) return;
    
    const bounds = new google.maps.LatLngBounds();
    markers.forEach(marker => {
        bounds.extend(marker.getPosition());
    });
    map.fitBounds(bounds);
    
    // Don't zoom in too much for single marker
    if (markers.length === 1) {
        map.setZoom(14);
    }
}
