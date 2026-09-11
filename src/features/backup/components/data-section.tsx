import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatLongDate } from '@/core/format';
import { localDateOf } from '@/core/date';
import { useTheme } from '@/core/theme';
import {
  usePrepareCopy,
  useRunExport,
  useRunImport,
  useExportFreshness,
} from '../data/backup-queries';
import type { ExportFreshness } from '../domain/export-age';
import { summariseProblems } from './problem-text';

/**
 * The "Données" section of Settings (specs 8.8, 12).
 *
 * > Export and import JSON, age indicator of the last export, "prepare a copy"
 * > button.
 *
 * No calculation here (conventions section 4): freshness comes from the domain
 * through a hook, and every refusal arrives already worded by problem-text.ts.
 * This file decides what is shown and how loud it is, nothing else.
 */

export function DataSection() {
  const theme = useTheme();
  const freshness = useExportFreshness();
  const exporting = useRunExport();
  const importing = useRunImport();
  const copying = usePrepareCopy();

  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const busy = exporting.isPending || importing.isPending || copying.isPending;

  function clear(): void {
    setMessage(null);
    setProblems([]);
  }

  function onExport(): void {
    clear();
    exporting.mutate(undefined, {
      onSuccess: (outcome) => {
        if (outcome.status === 'shared') {
          setMessage(
            `${outcome.rows} lignes exportées dans ${outcome.fileName}. ` +
              'Enregistrez-le hors de l’appareil.',
          );
        } else if (outcome.status === 'sharing_unavailable') {
          setMessage(
            `Le fichier ${outcome.fileName} a été écrit, mais le partage n’est pas disponible.`,
          );
        } else {
          setMessage(`L’export a échoué : ${outcome.message}`);
        }
      },
      onError: (error) => setMessage(`L’export a échoué : ${String(error)}`),
    });
  }

  /**
   * The destructive confirmation. It names what is about to be replaced,
   * because specs 5.4 makes the import a total replacement with no merge, and
   * D7 has it happen at a moment the user is already in a losing situation.
   */
  function onImport(): void {
    clear();
    Alert.alert(
      'Remplacer toutes les données ?',
      'L’import remplace intégralement la base : journal, repas, journées et réglages. ' +
        'Aucune fusion n’est possible. La base actuelle reste intacte jusqu’à la toute ' +
        'dernière étape ; si quoi que ce soit cloche, rien ne sera modifié.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Choisir un fichier',
          style: 'destructive',
          onPress: () =>
            importing.mutate(undefined, {
              onSuccess: (outcome) => {
                switch (outcome.status) {
                  case 'cancelled':
                    return;
                  case 'unreadable':
                    setMessage(`Fichier illisible : ${outcome.message}`);
                    return;
                  case 'refused': {
                    const summary = summariseProblems(outcome.problems);
                    setMessage(
                      'Archive refusée. Rien n’a été modifié : vos données sont intactes.',
                    );
                    setProblems(
                      summary.hidden === 0
                        ? summary.lines
                        : [...summary.lines, `… et ${summary.hidden} autre(s) problème(s).`],
                    );
                    return;
                  }
                  case 'replaced':
                    setMessage(
                      `${outcome.total} lignes importées.` +
                        (outcome.migratedThrough.length === 0
                          ? ''
                          : ` Archive mise à jour par ${outcome.migratedThrough.join(', ')}.`),
                    );
                    return;
                }
              },
              onError: (error) => setMessage(`L’import a échoué : ${String(error)}`),
            }),
        },
      ],
    );
  }

  function onPrepareCopy(): void {
    clear();
    copying.mutate(undefined, {
      onSuccess: (outcome) =>
        setMessage(
          `Copie prête : ${outcome.fileName}, dans le dossier « ${outcome.directoryName} » ` +
            'de l’app Fichiers.',
        ),
      onError: (error) => setMessage(`La copie a échoué : ${String(error)}`),
    });
  }

  return (
    <>
      <Text style={[styles.section, { color: theme.colors.textFaint }]}>DONNÉES</Text>

      <FreshnessBanner freshness={freshness.data} />

      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Text style={[styles.lead, { color: theme.colors.textMuted }]}>
          L’export JSON est la seule sauvegarde de l’application. Le cache Open Food Facts
          n’y figure pas : il se reconstruit tout seul.
        </Text>

        <Action label="Exporter" onPress={onExport} disabled={busy} />
        <Separator />
        <Action label="Importer" onPress={onImport} disabled={busy} destructive />
        <Separator />
        <Action label="Préparer une copie" onPress={onPrepareCopy} disabled={busy} />

        {busy ? <ActivityIndicator style={styles.spinner} /> : null}

        {message === null ? null : (
          <Text style={[styles.outcome, { color: theme.colors.text }]}>{message}</Text>
        )}
        {problems.map((line) => (
          <Text key={line} style={[styles.problem, { color: theme.colors.danger }]}>
            • {line}
          </Text>
        ))}
      </View>
    </>
  );
}

/**
 * The age indicator (specs 5.4), highlighted past the delay.
 *
 * Loud on purpose when there has never been an export. Since v2.1 the weight
 * exists nowhere but locally, and losing the device without a recent export is
 * a flat loss — so this is the one place in the application where an alarming
 * colour is the accurate one.
 */
function FreshnessBanner({ freshness }: { freshness: ExportFreshness | undefined }) {
  const theme = useTheme();
  if (freshness === undefined) return null;

  const alarming = freshness.state !== 'fresh';
  const colour = alarming ? theme.colors.danger : theme.colors.textMuted;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.surface,
          borderColor: alarming ? theme.colors.danger : theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.bannerText, { color: colour }]}>
        {freshness.state === 'never'
          ? 'Aucun export. Vos données n’existent que sur cet appareil.'
          : `Dernier export : ${describeAge(freshness.days)}, le ${formatLongDate(
              localDateOf(new Date(freshness.at)),
            )}.`}
      </Text>
    </View>
  );
}

function describeAge(days: number): string {
  if (days === 0) return "aujourd’hui";
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}

function Action({
  label,
  onPress,
  disabled,
  destructive,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
      <Text
        style={[
          styles.action,
          {
            color: disabled
              ? theme.colors.textFaint
              : destructive === true
                ? theme.colors.danger
                : theme.colors.accent,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Separator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />;
}

const styles = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 4, marginTop: 16 },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
  },
  bannerText: { fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  lead: { fontSize: 13, lineHeight: 19, paddingHorizontal: 14, paddingVertical: 10 },
  action: { fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
  spinner: { marginVertical: 8 },
  outcome: { fontSize: 14, lineHeight: 20, paddingHorizontal: 14, paddingVertical: 10 },
  problem: { fontSize: 13, lineHeight: 19, paddingHorizontal: 14, paddingBottom: 6 },
});
