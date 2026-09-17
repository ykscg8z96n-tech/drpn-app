// mobile/src/components/LocationFilterModal.web.js - Marketplace-style
// "browse events somewhere else" picker, web build. Uses the Google Maps
// JavaScript SDK (loaded on demand from the key the backend hands out via
// /geocode/maps-key) rather than react-native-maps, which doesn't render
// on Expo web at all.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const MIN_RADIUS_KM = 2;
const MAX_RADIUS_KM = 150;
const DEFAULT_RADIUS_KM = 25;
const RADIUS_PRESETS_KM = [10, 25, 50, 100];
const ACCENT = '#0078FF';

const makeSessionToken = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// The SDK script only ever needs loading once per page load - a second
// <script> tag with the same key would just redefine window.google and
// race with anything already using it.
let mapsLoadPromise = null;
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = api.get('/geocode/maps-key')
    .then(({ data }) => {
      const apiKey = data?.data?.apiKey;
      if (!apiKey) throw new Error('No Maps API key returned');
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Google Maps'));
        document.head.appendChild(script);
      });
    })
    .catch((error) => {
      mapsLoadPromise = null; // let a future attempt retry instead of caching the failure
      throw error;
    });

  return mapsLoadPromise;
}

export default function LocationFilterModal({ visible, onClose, onApply, onClear, initialLocation, deviceLocation }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  const markerRef = useRef(null);
  const sessionTokenRef = useRef(makeSessionToken());

  const [center, setCenter] = useState(null); // { lat, lng }
  const [label, setLabel] = useState('');
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [mapError, setMapError] = useState(false);
  const debounceRef = useRef(null);

  // Reverse geocodes a click/seed point to a city name instead of leaving
  // the label as raw coordinates or blank - fire-and-forget from the
  // caller's point of view, it just fills in `label` whenever it resolves.
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const response = await api.get('/geocode/reverse', { params: { lat, lon: lng } });
      const resolved = response.data.data;
      if (resolved?.address || resolved?.fullAddress) {
        setLabel(resolved.address || resolved.fullAddress);
      }
    } catch (error) {
      // leave whatever label (or lack of one) was already set
    }
  }, []);

  // Seed state AND mount the map in one effect, both from props directly
  // rather than from `center` state - reading state set by a separate
  // effect on the same render pass doesn't work here, since by the time
  // that state actually lands, [visible] (this effect's only real
  // dependency) hasn't changed again, so React would never re-run this
  // effect and the map would never be created.
  useEffect(() => {
    if (!visible) return;

    const seed = initialLocation
      ? { lat: initialLocation.latitude, lng: initialLocation.longitude }
      : deviceLocation
        ? { lat: deviceLocation.latitude, lng: deviceLocation.longitude }
        : null;
    const seedRadius = initialLocation?.radiusKm || DEFAULT_RADIUS_KM;

    setCenter(seed);
    setLabel(initialLocation?.label || '');
    setRadiusKm(seedRadius);
    setQuery('');
    setSuggestions([]);
    setMapError(false);
    sessionTokenRef.current = makeSessionToken();

    if (!seed || !mapContainerRef.current) return;

    // No stored label (e.g. seeded from device location rather than a
    // previously-applied filter) - look up what city that actually is.
    if (!initialLocation?.label) {
      reverseGeocode(seed.lat, seed.lng);
    }

    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled || !mapContainerRef.current) return;

      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: seed,
        zoom: 9,
        disableDefaultUI: true,
        zoomControl: true,
        styles: DARK_MAP_STYLE,
      });

      const marker = new window.google.maps.Marker({ position: seed, map });
      const circle = new window.google.maps.Circle({
        center: seed,
        radius: seedRadius * 1000,
        map,
        strokeColor: ACCENT,
        strokeWeight: 2,
        fillColor: ACCENT,
        fillOpacity: 0.12,
      });

      map.addListener('click', (e) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setCenter({ lat, lng });
        setLabel('');
        setQuery('');
        marker.setPosition({ lat, lng });
        circle.setCenter({ lat, lng });
        reverseGeocode(lat, lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    }).catch((error) => {
      console.error('❌ Failed to load Google Maps:', error);
      if (!cancelled) setMapError(true);
    });

    return () => {
      cancelled = true;
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, [visible]);

  // Keep the map's marker/circle/view in sync with center + radius changes
  // that come from search selection or the slider, without re-creating it.
  useEffect(() => {
    if (!mapRef.current || !center) return;
    markerRef.current?.setPosition(center);
    circleRef.current?.setCenter(center);
    mapRef.current.setCenter(center);
  }, [center]);

  useEffect(() => {
    circleRef.current?.setRadius(radiusKm * 1000);
  }, [radiusKm]);

  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = { q: text, sessionToken: sessionTokenRef.current };
        if (deviceLocation) {
          params.lat = deviceLocation.latitude;
          params.lon = deviceLocation.longitude;
        }
        const response = await api.get('/geocode/search', { params });
        setSuggestions(response.data.data || []);
      } catch (error) {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [deviceLocation?.latitude, deviceLocation?.longitude]);

  const handleSelectSuggestion = async (place) => {
    setSuggestions([]);
    setQuery(place.fullAddress);
    setResolving(true);
    try {
      const response = await api.get(`/geocode/place/${encodeURIComponent(place.placeId)}`, {
        params: { sessionToken: sessionTokenRef.current }
      });
      const resolved = response.data.data;
      setCenter({ lat: resolved.coordinates[1], lng: resolved.coordinates[0] });
      setLabel(resolved.address || resolved.fullAddress);
    } catch (error) {
      // no coordinates to fall back to here - just leave the map where it was
    } finally {
      setResolving(false);
      sessionTokenRef.current = makeSessionToken();
    }
  };

  const handleApply = () => {
    if (!center) return;
    onApply({
      latitude: center.lat,
      longitude: center.lng,
      label: label || `${center.lat.toFixed(2)}, ${center.lng.toFixed(2)}`,
      radiusKm,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Browse Location</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.searchArea}>
          <View style={styles.searchWrapper}>
            <Ionicons name="search" size={18} color="#666666" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search a city or address"
              placeholderTextColor="#666666"
            />
            {(searching || resolving) && <ActivityIndicator size="small" color={ACCENT} />}
          </View>
          {suggestions.length > 0 && (
            <FlatList
              style={styles.suggestionsList}
              data={suggestions}
              keyExtractor={(item, i) => `${item.placeId}-${i}`}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.suggestionRow} onPress={() => handleSelectSuggestion(item)}>
                  <Ionicons name="location-outline" size={16} color="#666666" />
                  <Text style={styles.suggestionText} numberOfLines={1}>{item.fullAddress}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        {mapError ? (
          <View style={[styles.map, styles.mapErrorContainer]}>
            <Text style={styles.mapErrorText}>Map couldn't load. You can still search above.</Text>
          </View>
        ) : (
          <View ref={mapContainerRef} style={styles.map} />
        )}

        <View style={styles.radiusSection}>
          <View style={styles.radiusHeader}>
            <Ionicons name="radio-button-on-outline" size={16} color={ACCENT} />
            <Text style={styles.radiusLabel}>{radiusKm} km radius</Text>
          </View>
          <input
            type="range"
            className="drpn-radius-slider"
            min={MIN_RADIUS_KM}
            max={MAX_RADIUS_KM}
            value={radiusKm}
            onChange={(e) => setRadiusKm(parseInt(e.target.value, 10))}
            style={sliderInputStyle}
          />
          <View style={styles.presetsRow}>
            {RADIUS_PRESETS_KM.map((km) => (
              <TouchableOpacity
                key={km}
                style={[styles.presetChip, radiusKm === km && styles.presetChipActive]}
                onPress={() => setRadiusKm(km)}
              >
                <Text style={[styles.presetChipText, radiusKm === km && styles.presetChipTextActive]}>
                  {km}km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.applyButton} onPress={handleApply} disabled={!center}>
          <Text style={styles.applyButtonText}>Apply</Text>
        </TouchableOpacity>
        {onClear && initialLocation && (
          <TouchableOpacity style={styles.clearButton} onPress={onClear}>
            <Text style={styles.clearButtonText}>Clear - use my current location</Text>
          </TouchableOpacity>
        )}
      </View>
      <style>{sliderThumbCss}</style>
    </Modal>
  );
}

// Google's own "Night" style, trimmed to match the app's dark chrome
// instead of the light default basemap.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1A1A1A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1A1A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A8A8A' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#333333' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252525' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1F2A1F' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2A2A' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#333333' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#252525' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E1626' }] },
];

// A plain <input type="range"> only takes its accent-color from the
// `accentColor` CSS property in modern browsers (no custom thumb needed),
// but Safari on iOS still ignores it - the injected <style> below covers
// that with explicit ::-webkit-slider-thumb/track rules.
const sliderInputStyle = {
  width: '100%',
  accentColor: ACCENT,
  height: 20,
};

const sliderThumbCss = `
  input[type="range"].drpn-radius-slider {
    -webkit-appearance: none;
    background: transparent;
  }
  input[type="range"].drpn-radius-slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: #333333;
  }
  input[type="range"].drpn-radius-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    margin-top: -8px;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: ${ACCENT};
    border: 3px solid #FFFFFF;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  }
  input[type="range"].drpn-radius-slider::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: #333333;
  }
  input[type="range"].drpn-radius-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: ${ACCENT};
    border: 3px solid #FFFFFF;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  }
`;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  searchArea: {
    zIndex: 10,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
    outlineStyle: 'none',
  },
  suggestionsList: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    maxHeight: 220,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  suggestionText: {
    flex: 1,
    color: '#C7C4C4',
    fontSize: 14,
  },
  map: {
    flex: 1,
    marginTop: 12,
  },
  mapErrorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  mapErrorText: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
  },
  radiusSection: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    backgroundColor: '#121212',
  },
  radiusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  radiusLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
  },
  presetChipActive: {
    backgroundColor: 'rgba(0, 120, 255, 0.15)',
    borderColor: ACCENT,
  },
  presetChipText: {
    color: '#C7C4C4',
    fontSize: 13,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: ACCENT,
  },
  applyButton: {
    backgroundColor: ACCENT,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 10,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#999999',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
