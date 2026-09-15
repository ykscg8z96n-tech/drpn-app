// mobile/src/components/LocationFilterModal.native.js - "browse events
// somewhere else" picker, native build. No visual map (react-native-maps
// doesn't ship in this app to avoid a Google Maps API key/billing
// requirement on Android) - just search + a radius slider, same data
// this produces on web, just without the circle-on-map visual.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import api from '../services/api';

const MIN_RADIUS_KM = 2;
const MAX_RADIUS_KM = 150;
const DEFAULT_RADIUS_KM = 25;

export default function LocationFilterModal({ visible, onClose, onApply, initialLocation, deviceLocation }) {
  const [selected, setSelected] = useState(null); // { latitude, longitude, label }
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    if (initialLocation) {
      setSelected({ latitude: initialLocation.latitude, longitude: initialLocation.longitude, label: initialLocation.label });
      setRadiusKm(initialLocation.radiusKm || DEFAULT_RADIUS_KM);
      setQuery(initialLocation.label || '');
    } else if (deviceLocation) {
      setSelected({ latitude: deviceLocation.latitude, longitude: deviceLocation.longitude, label: 'Current location' });
      setRadiusKm(DEFAULT_RADIUS_KM);
      setQuery('');
    }
    setSuggestions([]);
  }, [visible, initialLocation, deviceLocation]);

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
    setSelected({ latitude: place.coordinates[1], longitude: place.coordinates[0], label: place.address });
    setQuery(place.address);
    setSuggestions([]);
  };

  const handleApply = () => {
    if (!selected) return;
    onApply({
      latitude: selected.latitude,
      longitude: selected.longitude,
      label: selected.label,
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

        <View style={styles.summary}>
          <Ionicons name="pin" size={40} color="#0078FF" />
          <Text style={styles.summaryText}>
            {selected ? `${radiusKm}km around ${selected.label}` : 'Search for a place above'}
          </Text>
        </View>

        <View style={styles.radiusSection}>
          <Text style={styles.radiusLabel}>Radius: {radiusKm} km</Text>
          <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={MIN_RADIUS_KM}
            maximumValue={MAX_RADIUS_KM}
            step={1}
            value={radiusKm}
            onValueChange={setRadiusKm}
            minimumTrackTintColor="#0078FF"
            maximumTrackTintColor="#CCCCCC"
          />
        </View>

        <TouchableOpacity style={styles.applyButton} onPress={handleApply} disabled={!selected}>
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
  summary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  summaryText: {
    fontSize: 17,
    color: '#333333',
    textAlign: 'center',
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
