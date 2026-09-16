// mobile/src/components/LocationFilterModal.web.js - Marketplace-style
// "browse events somewhere else" picker, web build. Uses Leaflet +
// OpenStreetMap-derived tiles directly (free, no API key) rather than
// react-native-maps, which doesn't render on Expo web at all.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, FlatList, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Static import rather than dynamic import('leaflet') - this is a .web.js
// file so it's never bundled for native regardless, and a static import
// avoids depending on a separately-fetched chunk loading correctly
// (relative chunk URLs can be finicky under Vercel's SPA rewrite rule).
import L from 'leaflet';
import api from '../services/api';

// Leaflet's default marker icon normally resolves its image paths relative
// to its own CSS file - loading it through a bundler instead of a plain
// <script> tag breaks that lookup and every marker renders as a broken
// image. Point it at the CDN copies directly.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MIN_RADIUS_KM = 2;
const MAX_RADIUS_KM = 150;
const DEFAULT_RADIUS_KM = 25;
const RADIUS_PRESETS_KM = [10, 25, 50, 100];
const ACCENT = '#0078FF';

let leafletCssInjected = false;
function ensureLeafletCss() {
  if (leafletCssInjected || typeof document === 'undefined') return;
  leafletCssInjected = true;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);

  // Leaflet's chrome (zoom buttons, attribution strip) ships light-mode
  // styling that reads like a raw library default dropped onto a dark
  // app - restyle it to match instead of leaving it stock.
  const override = document.createElement('style');
  override.textContent = `
    .leaflet-container { background: #1A1A1A; font-family: inherit; }
    .leaflet-control-zoom { border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important; }
    .leaflet-control-zoom a {
      background-color: #1A1A1A !important;
      color: #FFFFFF !important;
      border-color: #333333 !important;
      width: 32px !important;
      height: 32px !important;
      line-height: 32px !important;
    }
    .leaflet-control-zoom a:hover { background-color: #2A2A2A !important; }
    .leaflet-control-attribution {
      background: rgba(18, 18, 18, 0.75) !important;
      color: #999999 !important;
      backdrop-filter: blur(4px);
    }
    .leaflet-control-attribution a { color: #C7C4C4 !important; }
  `;
  document.head.appendChild(override);
}

export default function LocationFilterModal({ visible, onClose, onApply, onClear, initialLocation, deviceLocation }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  const markerRef = useRef(null);

  const [center, setCenter] = useState(null); // { lat, lng }
  const [label, setLabel] = useState('');
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Seed state AND mount the Leaflet map in one effect, both from props
  // directly rather than from `center` state - reading state set by a
  // separate effect on the same render pass doesn't work here, since by
  // the time that state actually lands, [visible] (this effect's only
  // real dependency) hasn't changed again, so React would never re-run
  // this effect and the map would never be created.
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

    if (!seed || !mapContainerRef.current) return;

    ensureLeafletCss();

    const map = L.map(mapContainerRef.current, {
      center: [seed.lat, seed.lng],
      zoom: 9,
      zoomControl: true,
    });
    // Standard OpenStreetMap tiles - a fully dark basemap made place
    // names and water/land contrast hard to read; normal map colors
    // inside a dark app chrome (search bar, header, radius panel) reads
    // fine, same as any map app's light map on a dark surrounding UI.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([seed.lat, seed.lng]).addTo(map);
    const circle = L.circle([seed.lat, seed.lng], {
      radius: seedRadius * 1000,
      color: ACCENT,
      weight: 2,
      fillColor: ACCENT,
      fillOpacity: 0.12,
    }).addTo(map);

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      setCenter({ lat, lng });
      setLabel('');
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
    });

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    // The container's final flex-computed size can land a frame after
    // Leaflet reads it, especially right as the modal's slide-in
    // animation starts - without this it sometimes initializes against
    // a 0-height container and renders blank until the window resizes.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [visible]);

  // Keep the map's marker/circle/view in sync with center + radius changes
  // that come from search selection or the slider, without re-creating it.
  useEffect(() => {
    if (!mapRef.current || !center) return;
    markerRef.current?.setLatLng([center.lat, center.lng]);
    circleRef.current?.setLatLng([center.lat, center.lng]);
    mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom());
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
        const response = await api.get('/geocode/search', { params: { q: text } });
        setSuggestions(response.data.data || []);
      } catch (error) {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const handleSelectSuggestion = (place) => {
    setCenter({ lat: place.coordinates[1], lng: place.coordinates[0] });
    setLabel(place.address);
    setQuery(place.address);
    setSuggestions([]);
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
            {searching && <ActivityIndicator size="small" color={ACCENT} />}
          </View>
          {suggestions.length > 0 && (
            <FlatList
              style={styles.suggestionsList}
              data={suggestions}
              keyExtractor={(item, i) => `${item.address}-${i}`}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.suggestionRow} onPress={() => handleSelectSuggestion(item)}>
                  <Ionicons name="location-outline" size={16} color="#666666" />
                  <Text style={styles.suggestionText} numberOfLines={1}>{item.fullAddress}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        <View ref={mapContainerRef} style={styles.map} />

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
