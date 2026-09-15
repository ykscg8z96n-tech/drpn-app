// mobile/src/screens/Auth/SignupScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import TermsOfServiceScreen from './TermsOfServiceScreen';
import PrivacyPolicyScreen from './PrivacyPolicyScreen';

const signupSchema = Yup.object().shape({
  name: Yup.string().min(2, 'Name must be at least 2 characters').required('Name is required'),
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
});

export default function SignupScreen() {
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { signUp } = useAuth();
  const navigation = useNavigation();

  const handleSignup = async (values) => {
    if (!agreedToTerms) {
      Alert.alert(
        'Confirm to Continue',
        'Please confirm you\'re 18+ and agree to the Terms of Service and Privacy Policy.'
      );
      return;
    }

    setLoading(true);

    try {
      // Get user's location
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location access is required to find events near you.');
        setLoading(false);
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const userData = {
        ...values,
        location: {
          type: 'Point',
          coordinates: [location.coords.longitude, location.coords.latitude]
        },
        address: address[0] ? `${address[0].city}, ${address[0].region}` : 'Unknown location',
        interests: [], // Will be set during onboarding
        lookingFor: ['events', 'groups'] // Default
      };

      const result = await signUp(userData);
      setLoading(false);

      if (!result.success) {
        Alert.alert('Signup Failed', result.message);
      }
    } catch (error) {
      setLoading(false);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the community</Text>
        </View>

        <Formik
          initialValues={{ name: '', email: '', password: '' }}
          validationSchema={signupSchema}
          onSubmit={handleSignup}
        >
          {({ handleChange, handleBlur, handleSubmit, values, errors, touched }) => (
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, touched.name && errors.name && styles.inputError]}
                  placeholder="Full Name"
                  placeholderTextColor="#6B7280"
                  onChangeText={handleChange('name')}
                  onBlur={handleBlur('name')}
                  value={values.name}
                />
                {touched.name && errors.name && (
                  <Text style={styles.errorText}>{errors.name}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, touched.email && errors.email && styles.inputError]}
                  placeholder="Email"
                  placeholderTextColor="#6B7280"
                  onChangeText={handleChange('email')}
                  onBlur={handleBlur('email')}
                  value={values.email}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                {touched.email && errors.email && (
                  <Text style={styles.errorText}>{errors.email}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, touched.password && errors.password && styles.inputError]}
                  placeholder="Password"
                  placeholderTextColor="#6B7280"
                  onChangeText={handleChange('password')}
                  onBlur={handleBlur('password')}
                  value={values.password}
                  secureTextEntry
                />
                {touched.password && errors.password && (
                  <Text style={styles.errorText}>{errors.password}</Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setAgreedToTerms(prev => !prev)}
              >
                <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                  {agreedToTerms && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
                <Text style={styles.termsText}>
                  I'm 18 or older and I agree to the{' '}
                  <Text style={styles.termsLink} onPress={() => setShowTerms(true)}>
                    Terms of Service
                  </Text>{' '}
                  and{' '}
                  <Text style={styles.termsLink} onPress={() => setShowPrivacy(true)}>
                    Privacy Policy
                  </Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, (loading || !agreedToTerms) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading || !agreedToTerms}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <View style={styles.loginContainer}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.loginLink}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Formik>
      </ScrollView>

      <TermsOfServiceScreen visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyScreen visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#C7C4C4',
  },
  form: {
    paddingHorizontal: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#2C2C2C',
    borderWidth: 1,
    borderColor: '#666161',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  inputError: {
    borderColor: '#E12112',
  },
  errorText: {
    color: '#E12112',
    fontSize: 14,
    marginTop: 4,
    marginLeft: 4,
  },
  button: {
    backgroundColor: '#0078FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#666161',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#666161',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: '#0078FF',
    borderColor: '#0078FF',
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: '#C7C4C4',
    lineHeight: 20,
  },
  termsLink: {
    color: '#0078FF',
    textDecorationLine: 'underline',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  loginText: {
    fontSize: 16,
    color: '#C7C4C4',
  },
  loginLink: {
    fontSize: 16,
    color: '#0078FF',
    fontWeight: '600',
  },
});