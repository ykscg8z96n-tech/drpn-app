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

// Converts a Date to a 'YYYY-MM-DD' string using its LOCAL y/m/d, for
// building this component's value/min/max props from a Date object.
// `date.toISOString().split('T')[0]` looks equivalent but silently shifts
// the date by a day for anyone not at UTC+0, because toISOString()
// converts through UTC first.
export function toDateOnlyString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
        // Without these, the browser's own date-input layout algorithm
        // ignores its flex parent's available width and refuses to shrink
        // below its content size, so it overflows past siblings (e.g. the
        // Cancel/Save buttons) instead of sharing the row with them.
        width: '100%',
        minWidth: 0,
        flexShrink: 1,
        boxSizing: 'border-box',
        colorScheme: 'dark',
        ...style,
      }}
    />
  );
}
