// mobile/src/components/WebDateInput.js
//
// @react-native-community/datetimepicker has no web implementation, and a
// free-text field lets people type anything (letters, punctuation, digits
// in any order) with no feedback until save fails.
//
// This used to wrap the browser's native <input type="date"> for the
// built-in masking/calendar it gives for free, but that control's value
// text is rendered by the browser's own internal styling - on iOS Safari
// specifically, that comes out as a serif font no CSS here can override,
// which looked visibly out of place next to the rest of the app. This
// version builds the mask (MM / DD / YYYY segments, auto-advancing focus)
// out of plain RN TextInputs instead, so it renders with the exact same
// font as everything else and can't drift out of sync again.
//
// Only rendered when Platform.OS === 'web' - native screens should keep
// using <DateTimePicker> directly.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

// Converts a Date to a 'YYYY-MM-DD' string using its LOCAL y/m/d, for
// building this component's value prop from a Date object.
// `date.toISOString().split('T')[0]` looks equivalent but silently shifts
// the date by a day for anyone not at UTC+0, because toISOString()
// converts through UTC first.
export function toDateOnlyString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseYMD(value) {
  if (!value) return { y: '', m: '', d: '' };
  const [y, m, d] = value.split('-');
  return { y: y || '', m: m || '', d: d || '' };
}

// value/onChange both use 'YYYY-MM-DD' strings to match the API's ISO date
// format, so callers don't need to convert. onChange fires with '' while
// the three segments don't yet form a complete, plausible date.
export default function WebDateInput({ value, onChange, style }) {
  const initial = parseYMD(value);
  const [month, setMonth] = useState(initial.m);
  const [day, setDay] = useState(initial.d);
  const [year, setYear] = useState(initial.y);
  const monthRef = useRef(null);
  const dayRef = useRef(null);
  const yearRef = useRef(null);

  // Stay in sync if the parent resets `value` from outside (e.g. opening
  // the edit field fresh with the profile's existing birthday).
  useEffect(() => {
    const parsed = parseYMD(value);
    setMonth(parsed.m);
    setDay(parsed.d);
    setYear(parsed.y);
  }, [value]);

  const emit = (m, d, y) => {
    if (m.length === 2 && d.length === 2 && y.length === 4) {
      const mm = parseInt(m, 10);
      const dd = parseInt(d, 10);
      const yyyy = parseInt(y, 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1900) {
        onChange(`${y}-${m}-${d}`);
        return;
      }
    }
    onChange('');
  };

  const digitsOnly = (text, max) => text.replace(/\D/g, '').slice(0, max);

  const handleMonth = (text) => {
    const digits = digitsOnly(text, 2);
    setMonth(digits);
    emit(digits, day, year);
    if (digits.length === 2) dayRef.current?.focus();
  };

  const handleDay = (text) => {
    const digits = digitsOnly(text, 2);
    setDay(digits);
    emit(month, digits, year);
    if (digits.length === 2) yearRef.current?.focus();
  };

  const handleYear = (text) => {
    const digits = digitsOnly(text, 4);
    setYear(digits);
    emit(month, day, digits);
  };

  // Backspacing out of an empty segment jumps back to the previous one,
  // matching how a native date field behaves.
  const backspaceTo = (ref, currentValue) => (e) => {
    if (e.nativeEvent.key === 'Backspace' && currentValue === '') {
      ref.current?.focus();
    }
  };

  return (
    <View style={[styles.row, style]}>
      <TextInput
        ref={monthRef}
        style={styles.segment}
        value={month}
        onChangeText={handleMonth}
        placeholder="MM"
        placeholderTextColor="#666666"
        keyboardType="number-pad"
        maxLength={2}
      />
      <Text style={styles.separator}>/</Text>
      <TextInput
        ref={dayRef}
        style={styles.segment}
        value={day}
        onChangeText={handleDay}
        onKeyPress={backspaceTo(monthRef, day)}
        placeholder="DD"
        placeholderTextColor="#666666"
        keyboardType="number-pad"
        maxLength={2}
      />
      <Text style={styles.separator}>/</Text>
      <TextInput
        ref={yearRef}
        style={styles.segmentYear}
        value={year}
        onChangeText={handleYear}
        onKeyPress={backspaceTo(dayRef, year)}
        placeholder="YYYY"
        placeholderTextColor="#666666"
        keyboardType="number-pad"
        maxLength={4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#666666',
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  segment: {
    width: 32,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  segmentYear: {
    width: 56,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  separator: {
    fontSize: 16,
    color: '#666666',
    marginHorizontal: 2,
  },
});
