import Constants from 'expo-constants';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatInstantStamp } from '@/core/format';
import { prepareDatabase, type StartupReport, type StartupState } from './startup';

const StartupContext = createContext<StartupReport | null>(null);

/**
 * What the startup sequence found. Consumed by the About section of Settings,
 * which has to show the application and schema versions (specs 8.8).
 * Only callable below the gate, where the database is known to be ready.
 */
export function useStartupReport(): StartupReport {
  const report = useContext(StartupContext);
  if (report === null) {
    throw new Error('useStartupReport must be used inside DatabaseGate');
  }
  return report;
}

/**
 * Gates the application on the database being ready.
 *
 * Holds no business logic: it runs the sequence of startup.ts and renders one
 * of three outcomes. The refusal of D6/G3 has to be reachable before the router
 * mounts, since there is no usable application behind it.
 *
 * ## IT IS THE ONE SCREEN WITH NO THEME, AND IT HAS TO BE
 *
 * The theme preference is a row in `setting`, so it cannot be read before the
 * database is open — which is what this component is waiting for. Slice 7
 * therefore moved ThemeProvider BELOW this gate, and these three screens use
 * react-native's own Text with the colours written out, rather than core/ui's,
 * which needs a theme context that does not exist yet here.
 *
 * Consequence, named rather than discovered: the spinner and the two failure
 * screens are always light, whatever the user chose. They are the screens
 * shown when the application cannot run at all; the brand typeface and the
 * dark palette are not what is at stake on them.
 */
export function DatabaseGate({ children }: { children: ReactNode }) {
  const [report, setReport] = useState<StartupReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    void prepareDatabase().then((result) => {
      if (!cancelled) setReport(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (report === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const state: StartupState = report.state;

  if (state.status === 'ready') {
    return <StartupContext.Provider value={report}>{children}</StartupContext.Provider>;
  }

  if (state.status === 'blocked') {
    return (
      <BlockingScreen title="Base de données plus récente que l'application">
        <Text style={styles.paragraph}>
          Cette base a été créée par une version plus récente de l’application. Continuer
          l’écrirait avec un schéma ancien et abîmerait les données.
        </Text>
        <Text style={styles.paragraph}>
          Réinstallez la dernière version de l’application. Vos données sont intactes : elles
          sont simplement en avance sur ce binaire.
        </Text>

        {/*
          THE TWO NUMBERS THAT SAY WHY, which this screen used to withhold.

          Without them the refusal is a wall: "plus récente" gives no way to
          tell an application a week old from one that is one migration behind,
          and no way at all to tell either from a database that got ahead by a
          route nobody expected. The instants are the raw comparison the guard
          makes, so what is printed is exactly what was decided on.
        */}
        <Text style={styles.sectionTitle}>Ce que la comparaison a trouvé</Text>
        <Text style={styles.paragraph}>
          Cette application va jusqu’à la migration{' '}
          <Text style={styles.filename}>{state.binaryTag ?? 'aucune'}</Text>, du{' '}
          {stampOf(state.binaryWhen)}.
        </Text>
        <Text style={styles.paragraph}>
          La base, elle, a été migrée par un binaire portant une migration du{' '}
          {stampOf(state.databaseWhen)}. Elle n’existe pas dans celui-ci, donc il ne sait
          pas ce qu’elle a changé.
        </Text>

        <Text style={styles.sectionTitle}>Votre sauvegarde</Text>
        {state.backupFileName === null ? (
          <Text style={styles.paragraph}>
            Aucune copie automatique n’a encore été trouvée dans le dossier «{' '}
            {state.backupDirectoryName} ».
          </Text>
        ) : (
          <Text style={styles.paragraph}>
            La copie la plus récente s’appelle{' '}
            <Text style={styles.filename}>{state.backupFileName}</Text>.
          </Text>
        )}
        <Text style={styles.paragraph}>
          Pour la récupérer : ouvrez l’app Fichiers, allez dans « Sur mon iPhone », puis dans le
          dossier « {Constants.expoConfig?.name ?? 'Suivi'} », puis «{' '}
          {state.backupDirectoryName} ».
        </Text>
      </BlockingScreen>
    );
  }

  return (
    <BlockingScreen title="La base de données n’a pas pu s’ouvrir">
      <Text style={styles.paragraph}>
        L’application s’est arrêtée avant d’écrire quoi que ce soit. Aucune donnée n’a été
        modifiée.
      </Text>
      <Text style={styles.sectionTitle}>Détail technique</Text>
      <Text style={styles.code}>{state.message}</Text>
    </BlockingScreen>
  );
}

/**
 * An instant, as the technical stamp the backups already use.
 *
 * Not a French date, deliberately: this is a marker to compare against another
 * marker and against a file name in the backups folder, not a date anyone
 * reads for its own sake. Sorting by it is sorting by age, which is the whole
 * point of the comparison being shown.
 */
function stampOf(instant: number): string {
  return formatInstantStamp(new Date(instant));
}

function BlockingScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.blocking}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  blocking: { padding: 24, paddingTop: 96, gap: 14, backgroundColor: '#ffffff', flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '600', color: '#111111', marginBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6b6b6b', marginTop: 10 },
  paragraph: { fontSize: 15, lineHeight: 22, color: '#111111' },
  filename: { fontWeight: '600' },
  code: { fontSize: 13, color: '#6b6b6b', fontFamily: 'Courier' },
});
