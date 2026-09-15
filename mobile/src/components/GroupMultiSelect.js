// mobile/src/components/GroupMultiSelect.js
//
// Searchable multi-select for "which of your groups should this event
// auto-invite" - a plain checklist got unwieldy once someone belongs to
// more than a handful of groups, so this narrows the list as you type
// and shows what's already picked as removable chips.
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function GroupMultiSelect({ groups, selectedIds, onChange }) {
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  const selectedGroups = groups.filter(g => selectedIds.includes(g._id));

  const toggleGroup = (groupId) => {
    onChange(selectedIds.includes(groupId)
      ? selectedIds.filter(id => id !== groupId)
      : [...selectedIds, groupId]);
  };

  return (
    <View>
      {selectedGroups.length > 0 && (
        <View style={styles.chipRow}>
          {selectedGroups.map(group => (
            <TouchableOpacity key={group._id} style={styles.chip} onPress={() => toggleGroup(group._id)}>
              <Text style={styles.chipText} numberOfLines={1}>{group.name}</Text>
              <Ionicons name="close" size={14} color="#0078FF" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#666666" />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search your groups..."
          placeholderTextColor="#666666"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color="#666666" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.list}>
        {filteredGroups.length === 0 ? (
          <Text style={styles.emptyText}>No groups match "{query}"</Text>
        ) : (
          filteredGroups.map(group => {
            const selected = selectedIds.includes(group._id);
            return (
              <TouchableOpacity
                key={group._id}
                style={styles.row}
                onPress={() => toggleGroup(group._id)}
              >
                <Ionicons
                  name={selected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={selected ? '#0078FF' : '#666666'}
                />
                <Text style={styles.rowText}>{group.name}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 120, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#0078FF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 180,
  },
  chipText: {
    color: '#0078FF',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
  },
  list: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowText: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  emptyText: {
    color: '#666666',
    fontSize: 14,
    paddingVertical: 12,
    fontStyle: 'italic',
  },
});
