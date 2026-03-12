import {
  ConfigPlugin,
  withXcodeProject,
  withInfoPlist,
  withStringsXml,
  IOSConfig,
} from '@expo/config-plugins';
import { parse, compile } from 'apple-strings';
import type { I18nStringsFiles } from 'apple-strings';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AppNameLocalizationOptions } from './types';

// Re-export types
export * from './types';

const { getProjectName } = IOSConfig.XcodeUtils;

/**
 * Validates the locale code format
 */
function isValidLocaleCode(locale: string): boolean {
  // Basic validation for locale codes (e.g., "en", "en-US", "zh-Hans")
  return /^[a-z]{2}(-[A-Z]{2})?(-[A-Za-z]+)?$/.test(locale);
}

/**
 * Converts locale code to iOS format (e.g., "en-US" to "en-US", "ko" to "ko")
 */
function toIOSLocale(locale: string): string {
  return locale;
}

/**
 * Converts locale code to Android format (e.g., "en-US" to "en-rUS", "ko" to "ko")
 */
function toAndroidLocale(locale: string): string {
  if (locale.includes('-')) {
    const [language, region] = locale.split('-');
    return `${language}-r${region}`;
  }
  return locale;
}

/**
 * iOS: Add localized display names
 */
const withIOSLocalizedNames: ConfigPlugin<AppNameLocalizationOptions> = (
  config,
  { localizations }
) => {
  // Set LSHasLocalizedDisplayName in Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.LSHasLocalizedDisplayName = true;

    // Set default app name (English or first available)
    const defaultName = localizations.en || Object.values(localizations)[0];
    if (defaultName) {
      config.modResults.CFBundleDisplayName = defaultName;
    }

    return config;
  });

  // Add localization files to Xcode project
  config = withXcodeProject(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const project = config.modResults;
    const projectName = getProjectName(projectRoot);
    const supportingDirectory = path.join(projectRoot, 'ios', projectName, 'Supporting');

    const stringFileName = 'InfoPlist.strings';

    for (const [locale, appName] of Object.entries(localizations)) {
      if (!isValidLocaleCode(locale)) {
        console.warn(
          `[expo-plugin-app-name-localization] Invalid locale code: ${locale}. Skipping...`
        );
        continue;
      }

      const iosLocale = toIOSLocale(locale);
      const lprojDir = path.join(supportingDirectory, `${iosLocale}.lproj`);

      // Create directory
      await fs.ensureDir(lprojDir);

      // Create or update InfoPlist.strings file, preserving existing entries
      const stringsPath = path.join(lprojDir, stringFileName);
      let strings: I18nStringsFiles = {};
      try {
        const existingContent = await fs.readFile(stringsPath, 'utf8');
        strings = parse(existingContent);
      } catch {
        // File doesn't exist yet, start with empty entries
      }
      strings['CFBundleDisplayName'] = appName;
      const stringsContent = compile(strings);

      await fs.writeFile(stringsPath, stringsContent, 'utf8');

      console.log(
        `[expo-plugin-app-name-localization] Created ${iosLocale}.lproj/InfoPlist.strings with app name: ${appName}`
      );

      // Add to Xcode project
      try {
        const groupName = `${projectName}/Supporting/${iosLocale}.lproj`;

        // Ensure group exists
        const { ensureGroupRecursively } = await import(
          '@expo/config-plugins/build/ios/utils/Xcodeproj'
        );
        const group = ensureGroupRecursively(project, groupName);

        // Check if file already exists
        const fileAlreadyExists = group?.children?.some(
          (child: { comment?: string }) => child.comment === stringFileName
        );

        if (!fileAlreadyExists) {
          // Add file to Xcode project
          const { addResourceFileToGroup } = await import(
            '@expo/config-plugins/build/ios/utils/Xcodeproj'
          );
          addResourceFileToGroup({
            filepath: path.relative(supportingDirectory, stringsPath),
            groupName,
            project,
            isBuildFile: true,
            verbose: true,
          });

          console.log(
            `[expo-plugin-app-name-localization] Added ${iosLocale}.lproj/InfoPlist.strings to Xcode project`
          );
        }
      } catch (error) {
        console.error(
          `[expo-plugin-app-name-localization] Error adding ${iosLocale} to Xcode project:`,
          error
        );
      }
    }

    return config;
  });

  return config;
};

/**
 * Android: Add localized display names
 */
const withAndroidLocalizedNames: ConfigPlugin<AppNameLocalizationOptions> = (
  config,
  { localizations }
) => {
  // Set default app name in strings.xml
  config = withStringsXml(config, (config) => {
    const defaultName = localizations.en || Object.values(localizations)[0];
    if (defaultName) {
      // Find or create app_name string
      const strings = config.modResults.resources.string || [];
      const appNameIndex = strings.findIndex((s) => s.$.name === 'app_name');

      if (appNameIndex >= 0) {
        strings[appNameIndex]._ = defaultName;
      } else {
        strings.push({
          $: { name: 'app_name' },
          _: defaultName,
        });
      }

      config.modResults.resources.string = strings;
    }
    return config;
  });

  // Create localized values directories
  config = withStringsXml(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const androidResPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

    for (const [locale, appName] of Object.entries(localizations)) {
      if (!isValidLocaleCode(locale)) {
        console.warn(
          `[expo-plugin-app-name-localization] Invalid locale code: ${locale}. Skipping...`
        );
        continue;
      }

      const androidLocale = toAndroidLocale(locale);
      const valuesDir = path.join(androidResPath, `values-${androidLocale}`);

      // Ensure directory exists
      await fs.ensureDir(valuesDir);

      // Create or update strings.xml
      const stringsPath = path.join(valuesDir, 'strings.xml');
      let stringsContent = '';

      try {
        // Check if file exists
        if (await fs.pathExists(stringsPath)) {
          stringsContent = await fs.readFile(stringsPath, 'utf8');

          // Update existing app_name
          if (stringsContent.includes('name="app_name"')) {
            stringsContent = stringsContent.replace(
              /<string name="app_name">.*<\/string>/,
              `<string name="app_name">${appName}</string>`
            );
          } else {
            // Add app_name to existing file
            stringsContent = stringsContent.replace(
              '</resources>',
              `    <string name="app_name">${appName}</string>\n</resources>`
            );
          }
        } else {
          // Create new file
          stringsContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${appName}</string>
</resources>`;
        }

        await fs.writeFile(stringsPath, stringsContent, 'utf8');

        console.log(
          `[expo-plugin-app-name-localization] Created/updated values-${androidLocale}/strings.xml with app name: ${appName}`
        );
      } catch (error) {
        console.error(
          `[expo-plugin-app-name-localization] Error creating Android localization for ${androidLocale}:`,
          error
        );
      }
    }

    return config;
  });

  return config;
};

/**
 * Main plugin function that adds localized app names for both iOS and Android
 */
const withAppNameLocalization: ConfigPlugin<AppNameLocalizationOptions> = (config, options) => {
  // Validate options
  if (!options || !options.localizations || typeof options.localizations !== 'object') {
    throw new Error(
      '[expo-plugin-app-name-localization] Missing required "localizations" option. ' +
        'Please provide an object with locale codes as keys and app names as values.'
    );
  }

  if (Object.keys(options.localizations).length === 0) {
    throw new Error('[expo-plugin-app-name-localization] "localizations" object cannot be empty.');
  }

  // Apply iOS localization
  config = withIOSLocalizedNames(config, options);

  // Apply Android localization
  config = withAndroidLocalizedNames(config, options);

  return config;
};

export default withAppNameLocalization;
