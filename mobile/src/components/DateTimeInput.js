// mobile/src/components/DateTimeInput.js
//
// One component, one API (`value`/`onChange`, both plain JS Dates), for
// picking a date AND time - used anywhere the app needs an actual
// moment in time (event date), not just a day (see WebDateInput for
// date-only fields like a birthday). Each platform gets what's actually
// the "proper" picker for it instead of one compromise UI everywhere:
//
// - iOS: the real system picker (calendar grid + time wheel combined,
//   via `display="inline"` + `mode="datetime"`), in a bottom sheet.
// - Android: the real system dialogs - a Material calendar for the date,
//   then a clock/spinner for the time, chained the way Android's own
//   apps do it (its DateTimePicker has no combined datetime mode).
// - Web: react-native-datetimepicker has no web implementation at all,
//   so this builds an actual month-grid calendar + a time stepper from
//   scratch, in a modal styled to match the rest of the app - replacing
//   what used to be a bare MM/DD/YYYY text mask with no real calendar
//   and no time field.
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RNDateTimePicker from '@react-native-community/datetimepicker';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDateTime(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }) + ' at ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

// A plain month grid - Sun-Sat header row, then day cells (blank cells
// for the days before the 1st, so the 1st lands under its real weekday).
function CalendarGrid({ visibleMonth, selectedDate, minimumDate, onSelectDay }) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const minDay = minimumDate ? startOfDay(minimumDate) : null;

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push(<View key={`blank-${i}`} style={styles.dayCell} />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const isSelected = selectedDate && isSameDay(cellDate, selectedDate);
    const isPast = minDay && cellDate < minDay;
    cells.push(
      <TouchableOpacity
        key={day}
        style={[styles.dayCell, isSelected && styles.dayCellSelected]}
        disabled={isPast}
        onPress={() => onSelectDay(cellDate)}
      >
        <Text style={[
          styles.dayCellText,
          isPast && styles.dayCellTextDisabled,
          isSelected && styles.dayCellTextSelected
        ]}>
          {day}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <View key={i} style={styles.dayCell}>
            <Text style={styles.weekdayText}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>{cells}</View>
    </View>
  );
}

// Hour (1-12) / minute (00/15/30/45) steppers plus an AM/PM toggle -
// simpler and more reliable across web/touch than a scroll-snap wheel,
// while still being a real, direct time input rather than free text.
function TimeStepper({ hour12, minute, isPM, onChange }) {
  const stepHour = (delta) => {
    let next = hour12 + delta;
    if (next > 12) next = 1;
    if (next < 1) next = 12;
    onChange({ hour12: next, minute, isPM });
  };
  const stepMinute = (delta) => {
    let next = minute + delta;
    if (next >= 60) next = 0;
    if (next < 0) next = 45;
    onChange({ hour12, minute: next, isPM });
  };

  return (
    <View style={styles.timeRow}>
      <View style={styles.timeStepperColumn}>
        <TouchableOpacity style={styles.timeStepButton} onPress={() => stepHour(1)}>
          <Ionicons name="chevron-up" size={20} color="#0078FF" />
        </TouchableOpacity>
        <Text style={styles.timeValueText}>{String(hour12).padStart(2, '0')}</Text>
        <TouchableOpacity style={styles.timeStepButton} onPress={() => stepHour(-1)}>
          <Ionicons name="chevron-down" size={20} color="#0078FF" />
        </TouchableOpacity>
      </View>

      <Text style={styles.timeColon}>:</Text>

      <View style={styles.timeStepperColumn}>
        <TouchableOpacity style={styles.timeStepButton} onPress={() => stepMinute(15)}>
          <Ionicons name="chevron-up" size={20} color="#0078FF" />
        </TouchableOpacity>
        <Text style={styles.timeValueText}>{String(minute).padStart(2, '0')}</Text>
        <TouchableOpacity style={styles.timeStepButton} onPress={() => stepMinute(-15)}>
          <Ionicons name="chevron-down" size={20} color="#0078FF" />
        </TouchableOpacity>
      </View>

      <View style={styles.ampmColumn}>
        <TouchableOpacity
          style={[styles.ampmButton, !isPM && styles.ampmButtonActive]}
          onPress={() => onChange({ hour12, minute, isPM: false })}
        >
          <Text style={[styles.ampmButtonText, !isPM && styles.ampmButtonTextActive]}>AM</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ampmButton, isPM && styles.ampmButtonActive]}
          onPress={() => onChange({ hour12, minute, isPM: true })}
        >
          <Text style={[styles.ampmButtonText, isPM && styles.ampmButtonTextActive]}>PM</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function to24Hour(hour12, isPM) {
  if (hour12 === 12) return isPM ? 12 : 0;
  return isPM ? hour12 + 12 : hour12;
}

function from24Hour(hour24) {
  const isPM = hour24 >= 12;
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, isPM };
}

// The web calendar+time modal - visibleMonth/draftDate/draftTime are all
// local until "Done" is tapped, so backing out with the X or a tap
// outside never partially applies a change.
function WebPicker({ value, minimumDate, onConfirm, onClose }) {
  const initial = value || new Date();
  const [visibleMonth, setVisibleMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(startOfDay(initial));
  const { hour12: initialHour12, isPM: initialIsPM } = from24Hour(initial.getHours());
  const [time, setTime] = useState({
    hour12: initialHour12,
    minute: initial.getMinutes(),
    isPM: initialIsPM
  });

  const shiftMonth = (delta) => {
    setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handleDone = () => {
    const result = new Date(selectedDate);
    result.setHours(to24Hour(time.hour12, time.isPM), time.minute, 0, 0);
    onConfirm(result);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthNavButton}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {MONTH_NAMES[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthNavButton}>
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <CalendarGrid
            visibleMonth={visibleMonth}
            selectedDate={selectedDate}
            minimumDate={minimumDate}
            onSelectDay={setSelectedDate}
          />

          <View style={styles.divider} />

          <Text style={styles.timeLabel}>Time</Text>
          <TimeStepper
            hour12={time.hour12}
            minute={time.minute}
            isPM={time.isPM}
            onChange={setTime}
          />

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// iOS's native picker already gives a real calendar grid + time wheel in
// one control when display="inline" and mode="datetime" - just needs a
// sheet around it with the same Cancel/Done pattern as the web version.
function IOSPicker({ value, minimumDate, onConfirm, onClose }) {
  const [draft, setDraft] = useState(value || new Date());

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <RNDateTimePicker
            value={draft}
            mode="datetime"
            display="inline"
            themeVariant="dark"
            minimumDate={minimumDate}
            onChange={(event, selectedDate) => {
              if (selectedDate && event.type !== 'dismissed') {
                setDraft(selectedDate);
              }
            }}
          />
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneButton} onPress={() => onConfirm(draft)}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function DateTimeInput({ value, onChange, minimumDate }) {
  const [showWebOrIOSPicker, setShowWebOrIOSPicker] = useState(false);
  // Android has no combined datetime mode - this tracks which native
  // dialog is currently up, chaining date -> time the way Android's own
  // apps do it.
  const [androidStep, setAndroidStep] = useState(null); // null | 'date' | 'time'
  const [androidDraftDate, setAndroidDraftDate] = useState(null);

  const openPicker = () => {
    if (Platform.OS === 'android') {
      setAndroidDraftDate(value || new Date());
      setAndroidStep('date');
    } else {
      setShowWebOrIOSPicker(true);
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.fieldButton} onPress={openPicker}>
        <Ionicons name="calendar" size={20} color="#0078FF" />
        <Text style={styles.fieldButtonText}>
          {value ? formatDateTime(value) : 'Select date and time'}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#999999" />
      </TouchableOpacity>

      {Platform.OS === 'web' && showWebOrIOSPicker && (
        <WebPicker
          value={value}
          minimumDate={minimumDate}
          onConfirm={(result) => { onChange(result); setShowWebOrIOSPicker(false); }}
          onClose={() => setShowWebOrIOSPicker(false)}
        />
      )}

      {Platform.OS === 'ios' && showWebOrIOSPicker && (
        <IOSPicker
          value={value}
          minimumDate={minimumDate}
          onConfirm={(result) => { onChange(result); setShowWebOrIOSPicker(false); }}
          onClose={() => setShowWebOrIOSPicker(false)}
        />
      )}

      {Platform.OS === 'android' && androidStep === 'date' && (
        <RNDateTimePicker
          value={androidDraftDate}
          mode="date"
          display="calendar"
          minimumDate={minimumDate}
          onChange={(event, selectedDate) => {
            if (event.type === 'dismissed') {
              setAndroidStep(null);
              return;
            }
            setAndroidDraftDate(selectedDate);
            setAndroidStep('time');
          }}
        />
      )}

      {Platform.OS === 'android' && androidStep === 'time' && (
        <RNDateTimePicker
          value={androidDraftDate}
          mode="time"
          display="clock"
          onChange={(event, selectedTime) => {
            setAndroidStep(null);
            if (event.type === 'dismissed' || !selectedTime) return;
            const combined = new Date(androidDraftDate);
            combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            onChange(combined);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fieldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#666666',
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthNavButton: {
    padding: 6,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  weekdayRow: {
    flexDirection: 'row',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#0078FF',
    borderRadius: 999,
  },
  dayCellText: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  dayCellTextDisabled: {
    color: '#444444',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  weekdayText: {
    fontSize: 12,
    color: '#999999',
    fontWeight: '600',
  },

  divider: {
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 16,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999999',
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  timeStepperColumn: {
    alignItems: 'center',
    gap: 4,
  },
  timeStepButton: {
    padding: 6,
  },
  timeValueText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: 36,
    textAlign: 'center',
  },
  timeColon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ampmColumn: {
    marginLeft: 12,
    gap: 6,
  },
  ampmButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#666666',
  },
  ampmButtonActive: {
    backgroundColor: '#0078FF',
    borderColor: '#0078FF',
  },
  ampmButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999999',
  },
  ampmButtonTextActive: {
    color: '#FFFFFF',
  },

  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#999999',
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: '#0078FF',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  doneButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
