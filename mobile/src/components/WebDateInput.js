// mobile/src/components/WebDateInput.js
//
// @react-native-community/datetimepicker has no web implementation, and a
// free-text field lets people type anything (letters, punctuation, digits
// in any order) with no feedback until save fails. The browser's own
// <input type="date"> already gives a masked, locale-aware date field with
// a built-in calendar picker for free, so on web this renders that real
// DOM element directly (react-native-web runs on react-dom, so a plain
// 'input' host element works) instead of reinventing input masking.
//
// Only rendered when Platform.OS === 'web' - native screens should keep
// using <DateTimePicker> directly.
import React from 'react';

// value/onChange both use 'YYYY-MM-DD' strings to match the API's
// ISO date format, so callers don't need to convert.
export default function WebDateInput({ value, onChange, min, max, style }) {
  return (
    <input
      type="date"
      value={value || ''}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: 'inherit',
        fontSize: 16,
        color: '#FFFFFF',
        backgroundColor: '#111111',
        border: '1px solid #666666',
        borderRadius: 8,
        paddingTop: 12,
        paddingBottom: 12,
        paddingLeft: 16,
        paddingRight: 16,
        width: '100%',
        boxSizing: 'border-box',
        colorScheme: 'dark',
        ...style,
      }}
    />
  );
}
