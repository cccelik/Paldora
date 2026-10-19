import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.sparkle}>✦</Text>
      <Text style={styles.title}>Paldora</Text>
      <Text style={styles.subtitle}>A box for your people.</Text>
      <Text style={styles.caption}>
        Mobile foundation ready for the shared API.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fbf7ed',
    padding: 32,
  },
  sparkle: { color: '#a97c32', fontSize: 22, marginBottom: 12 },
  title: {
    color: '#17140f',
    fontSize: 52,
    fontWeight: '600',
    letterSpacing: -2,
  },
  subtitle: { color: '#a97c32', fontSize: 22, marginTop: 8 },
  caption: {
    color: '#6b6256',
    fontSize: 14,
    marginTop: 32,
    textAlign: 'center',
  },
});
