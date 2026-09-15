// mobile/src/components/LocationFilterModal.web.js - Marketplace-style
// "browse events somewhere else" picker, web build. Uses Leaflet +
// OpenStreetMap tiles directly (free, no API key) rather than
// react-native-maps, which doesn't render on Expo web at all.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const MIN_RADIUS_KM = 2;
const MAX_RADIUS_KM = 150;
const DEFAULT_RADIUS_KM = 25;

let leafletCssInjected = false;
function ensureLeafletCss() {
  if (leafletCssInjected || typeof document === 'undefined') return;
  leafletCssInjected = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

export default function LocationFilterModal({ visible, onClose, onApply, initialLocation, deviceLocation }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  const markerRef = useRef(null);
  const leafletRef = useRef(null);

  const [center, setCenter] = useState(null); // { lat, lng }
  const [label, setLabel] = useState('');
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Seed from whatever's already applied, or the device's live location.
  useEffect(() => {
    if (!visible) return;
    if (initialLocation) {
      setCenter({ lat: initialLocation.latitude, lng: initialLocation.longitude });
      setLabel(initialLocation.label || '');
      setRadiusKm(initialLocation.radiusKm || DEFAULT_RADIUS_KM);
    } else if (deviceLocation) {
      setCenter({ lat: deviceLocation.latitude, lng: deviceLocation.longitude });
      setLabel('');
      setRadiusKm(DEFAULT_RADIUS_KM);
    }
    setQuery('');
    setSuggestions([]);
  }, [visible, initialLocation, deviceLocation]);

  // Mount/tear down the Leaflet map alongside the modal itself.
  useEffect(() => {
    if (!visible || !center || !mapContainerRef.current) return;

    ensureLeafletCss();
    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapContainerRef.current) return;
      leafletRef.current = L;

      const map = L.map(mapContainerRef.current, {
        center: [center.lat, center.lng],
        zoom: 9,
        zoomControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      const marker = L.marker([center.lat, center.lng]).addTo(map);
      const circle = L.circle([center.lat, center.lng], {
        radius: radiusKm * 1000,
        color: '#0078FF',
        fillColor: '#0078FF',
        fillOpacity: 0.15,
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
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
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
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Location</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={18} color="#666" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search a city or address"
            placeholderTextColor="#999"
          />
          {searching && <ActivityIndicator size="small" color="#0078FF" />}
        </View>
        {suggestions.length > 0 && (
          <FlatList
            style={styles.suggestionsList}
            data={suggestions}
            keyExtractor={(item, i) => `${item.address}-${i}`}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestionRow} onPress={() => handleSelectSuggestion(item)}>
                <Ionicons name="location-outline" size={16} color="#666" />
                <Text style={styles.suggestionText} numberOfLines={1}>{item.fullAddress}</Text>
              </TouchableOpacity>
            )}
          />
        )}

        <View ref={mapContainerRef} style={styles.map} />

        <View style={styles.radiusSection}>
          <Text style={styles.radiusLabel}>Radius: {radiusKm} km</Text>
          <input
            type="range"
            min={MIN_RADIUS_KM}
            max={MAX_RADIUS_KM}
            value={radiusKm}
            onChange={(e) => setRadiusKm(parseInt(e.target.value, 10))}
            style={{ width: '100%' }}
          />
        </View>

        <TouchableOpacity style={styles.applyButton} onPress={handleApply} disabled={!center}>
          <Text style={styles.applyButtonText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    marginHorizontal: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000000',
    outlineStyle: 'none',
  },
  suggestionsList: {
    maxHeight: 180,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    marginTop: 4,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionText: {
    flex: 1,
    color: '#333333',
    fontSize: 14,
  },
  map: {
    flex: 1,
    marginTop: 12,
  },
  radiusSection: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  radiusLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  applyButton: {
    backgroundColor: '#0078FF',
    marginHorizontal: 16,
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
});
