// mobile/src/components/GroupMultiSelect.js
//
// Searchable multi-select for "which of your groups should this event
// auto-invite" - a plain checklist got unwieldy once someone belongs to
// more than a handful of groups, so this narrows the list as you type
// and shows what's already picked as removable chips.
//
// Selection uses the same filled/outlined pill toggle as the Filter
// drawer's category chips, instead of a checkbox-per-row list, so
// "picking multiple things" looks and feels the same everywhere in the
// app rather than checkboxes in one place and pills in another.
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
              <Ionicons name="close" size={14} color="#FFFFFF" />
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

      <View style={styles.pillGrid}>
        {filteredGroups.length === 0 ? (
          <Text style={styles.emptyText}>No groups match "{query}"</Text>
        ) : (
          filteredGroups.map(group => {
            const selected = selectedIds.includes(group._id);
            return (
              <TouchableOpacity
                key={group._id}
                style={[styles.pill, selected && styles.pillActive]}
                onPress={() => toggleGroup(group._id)}
              >
                <Text style={[styles.pillText, selected && styles.pillTextActive]} numberOfLines={1}>
                  {group.name}
                </Text>
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
    backgroundColor: '#0078FF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 180,
  },
  chipText: {
    color: '#FFFFFF',
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
    outlineStyle: 'none',
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    maxWidth: 200,
  },
  pillActive: {
    backgroundColor: '#0078FF',
    borderColor: '#0078FF',
  },
  pillText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  pillTextActive: {
    fontWeight: '700',
  },
  emptyText: {
    color: '#666666',
    fontSize: 14,
    paddingVertical: 12,
    fontStyle: 'italic',
  },
});
