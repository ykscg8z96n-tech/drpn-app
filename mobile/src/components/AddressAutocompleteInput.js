// mobile/src/components/AddressAutocompleteInput.js
import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const makeSessionToken = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// Address input with live suggestions from the backend's Google Places
// (New) proxy. Autocomplete only returns placeId + display text (no
// coordinates - those are pricier), so picking a suggestion triggers a
// second call to resolve the full address + coordinates. Both calls share
// a sessionToken so Google bills the whole search as one session; a fresh
// token is minted after each pick (or when the field is cleared) so the
// next search starts its own billing session.
export default function AddressAutocompleteInput({ value, onChangeText, onSelectPlace, placeholder, biasLocation, showIcon = true }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);
  const sessionTokenRef = useRef(makeSessionToken());

  const fetchSuggestions = useCallback((text) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = { q: text, sessionToken: sessionTokenRef.current };
        if (biasLocation?.latitude != null && biasLocation?.longitude != null) {
          params.lat = biasLocation.latitude;
          params.lon = biasLocation.longitude;
        }
        const response = await api.get('/geocode/search', { params });
        setSuggestions(response.data.data || []);
      } catch (error) {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, [biasLocation?.latitude, biasLocation?.longitude]);

  const handleChangeText = (text) => {
    onChangeText(text);
    setShowSuggestions(true);
    fetchSuggestions(text);
  };

  const handleSelect = async (place) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setResolving(true);
    try {
      const response = await api.get(`/geocode/place/${encodeURIComponent(place.placeId)}`, {
        params: { sessionToken: sessionTokenRef.current }
      });
      onSelectPlace(response.data.data);
    } catch (error) {
      // fall back to what we already have (no coordinates) rather than losing the pick
      onSelectPlace(place);
    } finally {
      setResolving(false);
      sessionTokenRef.current = makeSessionToken();
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.addressInputContainer}>
        {showIcon && <Ionicons name="location-outline" size={20} color="#666666" />}
        <TextInput
          style={styles.addressInput}
          value={value}
          onChangeText={handleChangeText}
          onFocus={() => setShowSuggestions(true)}
          placeholder={placeholder}
          placeholderTextColor="#666"
        />
        {(loading || resolving) && <ActivityIndicator size="small" color="#0078FF" />}
      </View>

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsList}>
          {suggestions.map((place, index) => (
            <TouchableOpacity
              key={`${place.fullAddress}-${index}`}
              style={styles.suggestionRow}
              onPress={() => handleSelect(place)}
            >
              <Ionicons name="location" size={16} color="#999" />
              <Text style={styles.suggestionText} numberOfLines={2}>{place.fullAddress}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 10,
  },
  addressInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  addressInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 12,
    outlineStyle: 'none',
  },
  suggestionsList: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  suggestionText: {
    flex: 1,
    color: '#CCCCCC',
    fontSize: 14,
  },
});
