// mobile/src/components/ActionSheet.js
//
// The web Alert polyfill (see utils/webAlertPolyfill.js) can only really
// express an info alert or a confirm/cancel choice - window.confirm has no
// way to distinguish between more than one non-cancel action, so any
// Alert.alert with 3+ buttons silently collapses to "first action vs
// cancel" on web. That's fine for confirm dialogs but breaks real option
// menus (e.g. "Block / Report / Cancel"). This is a real modal-based
// action sheet that works identically on native and web, for any menu
// with more than two choices.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';

export default function ActionSheet({ visible, title, options, onClose }) {
  const handleSelect = (option) => {
    onClose();
    option.onPress?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title && <Text style={styles.title}>{title}</Text>}
          {options.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.option, index < options.length - 1 && styles.optionBorder]}
              onPress={() => handleSelect(option)}
            >
              <Text style={[styles.optionText, option.destructive && styles.destructiveText]}>
                {option.text}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  title: {
    color: '#999999',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  option: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  optionText: {
    color: '#0078FF',
    fontSize: 17,
    fontWeight: '500',
  },
  destructiveText: {
    color: '#FF3B30',
  },
  cancelButton: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
