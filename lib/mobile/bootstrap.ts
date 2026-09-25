import { generateUuid } from '../auth/tokens'
import type { ProjectFile } from '../db/types'

export function getMobileBootstrapFiles(projectId: string, userId: string, now: string): ProjectFile[] {
  const files: Array<{ path: string; name: string; is_folder: boolean; content: string; mime_type: string }> = [
    {
      path: 'package.json',
      name: 'package.json',
      is_folder: false,
      mime_type: 'application/json',
      content: JSON.stringify(
        {
          name: 'vx-mobile-app',
          version: '1.0.0',
          private: true,
          scripts: {
            start: 'expo start',
            android: 'expo start --android',
            ios: 'expo start --ios',
            web: 'expo start --web',
          },
          dependencies: {
            '@expo/vector-icons': '^14.0.0',
            '@react-navigation/native': '^6.1.9',
            '@react-navigation/stack': '^6.3.20',
            'expo': '~51.0.0',
            'expo-status-bar': '~1.12.1',
            'react': '18.3.1',
            'react-native': '0.74.1',
            'react-native-safe-area-context': '4.10.5',
            'react-native-screens': '3.31.1',
          },
          devDependencies: {
            '@babel/core': '^7.20.0',
            '@types/react': '~18.2.45',
            'typescript': '~5.1.3',
          },
        },
        null,
        2
      ),
    },
    {
      path: 'app.json',
      name: 'app.json',
      is_folder: false,
      mime_type: 'application/json',
      content: JSON.stringify(
        {
          expo: {
            name: 'VX Mobile App',
            slug: 'vx-mobile-app',
            version: '1.0.0',
            orientation: 'portrait',
            icon: './assets/icon.png',
            userInterfaceStyle: 'dark',
            splash: {
              image: './assets/splash.png',
              resizeMode: 'contain',
              backgroundColor: '#0d0d11',
            },
            android: {
              package: 'com.vx.mobileapp',
              adaptiveIcon: {
                foregroundImage: './assets/icon-maskable.png',
                backgroundColor: '#0d0d11',
              },
            },
            plugins: ['expo-router'],
          },
        },
        null,
        2
      ),
    },
    {
      path: 'App.tsx',
      name: 'App.tsx',
      is_folder: false,
      mime_type: 'text/typescript',
      content: `import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <Text style={styles.title}>VX Mobile App</Text>
        <Text style={styles.subtitle}>Built with Expo & React Native</Text>
        <TouchableOpacity style={styles.button} onPress={() => alert('Welcome to your Expo mobile app!')}>
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d11',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#18181c',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#a1a1aa',
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#27272a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
`,
    },
    {
      path: '.env.example',
      name: '.env.example',
      is_folder: false,
      mime_type: 'text/plain',
      content: `# Public mobile client configuration (NEVER PUT VX SERVER SECRETS HERE)
EXPO_PUBLIC_API_URL=https://api.vx.dev
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
`,
    },
  ]

  return files.map((f) => ({
    id: generateUuid(),
    project_id: projectId,
    user_id: userId,
    path: f.path,
    name: f.name,
    is_folder: f.is_folder,
    content: f.content,
    mime_type: f.mime_type,
    size: f.content.length,
    version: 1,
    created_at: now,
    updated_at: now,
  }))
}
