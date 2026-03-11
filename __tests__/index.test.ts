import { withInfoPlist, withStringsXml, withXcodeProject } from '@expo/config-plugins';
import withAppNameLocalization from '../src/index';

// Mock the config plugins
jest.mock('@expo/config-plugins', () => ({
  ...jest.requireActual('@expo/config-plugins'),
  withXcodeProject: jest.fn((config) => config),
  withInfoPlist: jest.fn((config) => config),
  withStringsXml: jest.fn((config) => config),
  IOSConfig: {
    XcodeUtils: {
      getProjectName: jest.fn(() => 'TestProject'),
    },
  },
}));

// Mock fs-extra
jest.mock('fs-extra', () => ({
  ensureDir: jest.fn(),
  writeFile: jest.fn(),
  pathExists: jest.fn(() => Promise.resolve(false)),
  readFile: jest.fn(),
}));

describe('expo-plugin-app-name-localization', () => {
  const mockConfig = {
    name: 'TestApp',
    slug: 'test-app',
    modRequest: {
      projectRoot: '/path/to/project',
    },
    modResults: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Plugin validation', () => {
    it('should throw error if localizations option is missing', () => {
      expect(() => {
        withAppNameLocalization(mockConfig, {} as any);
      }).toThrow('Missing required "localizations" option');
    });

    it('should throw error if localizations is not an object', () => {
      expect(() => {
        withAppNameLocalization(mockConfig, { localizations: 'invalid' } as any);
      }).toThrow('Missing required "localizations" option');
    });

    it('should throw error if localizations is empty', () => {
      expect(() => {
        withAppNameLocalization(mockConfig, { localizations: {} });
      }).toThrow('"localizations" object cannot be empty');
    });
  });

  describe('Valid configuration', () => {
    const validOptions = {
      localizations: {
        en: 'Test App',
        ko: '테스트 앱',
        'zh-Hans': '测试应用',
      },
    };

    it('should accept valid configuration', () => {
      // Mock the config plugins to prevent actual execution
      (withInfoPlist as jest.MockedFunction<typeof withInfoPlist>).mockImplementation(
        (config) => config
      );
      (withStringsXml as jest.MockedFunction<typeof withStringsXml>).mockImplementation(
        (config) => config
      );

      expect(() => {
        withAppNameLocalization(mockConfig, validOptions);
      }).not.toThrow();
    });

    it('should call withInfoPlist for iOS configuration', () => {
      // Mock the config plugins
      (withInfoPlist as jest.MockedFunction<typeof withInfoPlist>).mockImplementation(
        (config) => config
      );
      (withStringsXml as jest.MockedFunction<typeof withStringsXml>).mockImplementation(
        (config) => config
      );

      withAppNameLocalization(mockConfig, validOptions);
      expect(withInfoPlist).toHaveBeenCalled();
    });

    it('should call withStringsXml for Android configuration', () => {
      // Mock the config plugins
      (withInfoPlist as jest.MockedFunction<typeof withInfoPlist>).mockImplementation(
        (config) => config
      );
      (withStringsXml as jest.MockedFunction<typeof withStringsXml>).mockImplementation(
        (config) => config
      );

      withAppNameLocalization(mockConfig, validOptions);
      expect(withStringsXml).toHaveBeenCalled();
    });
  });

  describe('iOS configuration', () => {
    it('should set LSHasLocalizedDisplayName in Info.plist', () => {
      const config: any = { ...mockConfig, modResults: {} };
      const options = { localizations: { en: 'My App' } };

      const mockWithInfoPlist = withInfoPlist as jest.MockedFunction<typeof withInfoPlist>;
      mockWithInfoPlist.mockImplementation((config, callback) => {
        callback(config as any);
        return config;
      });

      withAppNameLocalization(config, options);

      expect(config.modResults.LSHasLocalizedDisplayName).toBe(true);
      expect(config.modResults.CFBundleDisplayName).toBe('My App');
    });
  });

  describe('Android configuration', () => {
    it('should update app_name in strings.xml', () => {
      const config = {
        ...mockConfig,
        modResults: {
          resources: {
            string: [{ $: { name: 'app_name' }, _: 'OldName' }],
          },
        },
      };

      const options = { localizations: { en: 'New App Name' } };

      const mockWithStringsXml = withStringsXml as jest.MockedFunction<typeof withStringsXml>;
      mockWithStringsXml.mockImplementation((config, callback) => {
        callback(config as any);
        return config;
      });

      withAppNameLocalization(config, options);

      const appNameString = config.modResults.resources.string.find(
        (s: any) => s.$.name === 'app_name'
      );
      expect(appNameString).toBeDefined();
      expect(appNameString!._).toBe('New App Name');
    });

    it('should create app_name if it does not exist', () => {
      const config = {
        ...mockConfig,
        modResults: {
          resources: {
            string: [],
          },
        },
      };

      const options = { localizations: { en: 'Brand New App' } };

      const mockWithStringsXml = withStringsXml as jest.MockedFunction<typeof withStringsXml>;
      mockWithStringsXml.mockImplementation((config, callback) => {
        callback(config as any);
        return config;
      });

      withAppNameLocalization(config, options);

      const appNameString = config.modResults.resources.string.find(
        (s: any) => s.$.name === 'app_name'
      );
      expect(appNameString).toBeDefined();
      expect((appNameString as any)._).toBe('Brand New App');
    });
  });

  describe('Locale validation', () => {
    it('should process valid locale codes', () => {
      // Mock the config plugins
      (withInfoPlist as jest.MockedFunction<typeof withInfoPlist>).mockImplementation(
        (config) => config
      );
      (withStringsXml as jest.MockedFunction<typeof withStringsXml>).mockImplementation(
        (config) => config
      );

      const validLocales = {
        en: 'English',
        'en-US': 'American English',
        'zh-Hans': 'Simplified Chinese',
        ko: 'Korean',
      };

      expect(() => {
        withAppNameLocalization(mockConfig, { localizations: validLocales });
      }).not.toThrow();
    });

    it('should warn about invalid locale codes', () => {
      // Mock the config plugins
      (withInfoPlist as jest.MockedFunction<typeof withInfoPlist>).mockImplementation(
        (config) => config
      );
      (withStringsXml as jest.MockedFunction<typeof withStringsXml>).mockImplementation(
        (config) => config
      );
      (withXcodeProject as jest.MockedFunction<typeof withXcodeProject>).mockImplementation(
        (config, callback) => {
          callback(config as any);
          return config;
        }
      );

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const invalidLocales = {
        invalid_locale: 'Invalid',
        '123': 'Numbers',
        EN: 'Uppercase',
      };

      withAppNameLocalization(mockConfig, { localizations: invalidLocales });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid locale code'));

      consoleSpy.mockRestore();
    });
  });

  describe('Locale conversion', () => {
    it('should convert locale codes correctly for Android', async () => {
      // Create config with required structure for Android
      const configWithResources = {
        ...mockConfig,
        modResults: {
          resources: {
            string: [],
          },
        },
      };

      // Mock the config plugins
      (withInfoPlist as jest.MockedFunction<typeof withInfoPlist>).mockImplementation(
        (config) => config
      );

      let stringsXmlCalls = 0;
      (withStringsXml as jest.MockedFunction<typeof withStringsXml>).mockImplementation(
        (config, callback) => {
          // Make sure modResults has the expected structure
          const configAny = config as any;
          if (!configAny.modResults) {
            configAny.modResults = { resources: { string: [] } };
          }
          if (!configAny.modResults.resources) {
            configAny.modResults.resources = { string: [] };
          }

          // Only call the async callback on the second call (the one that creates directories)
          if (stringsXmlCalls === 1) {
            callback(configAny);
          } else {
            // For the first call, just update config synchronously
            const defaultName = 'American App';
            configAny.modResults.resources.string = [{ $: { name: 'app_name' }, _: defaultName }];
          }

          stringsXmlCalls++;
          return config;
        }
      );

      (withXcodeProject as jest.MockedFunction<typeof withXcodeProject>).mockImplementation(
        (config) => config
      );

      const fs = require('fs-extra');
      const options = {
        localizations: {
          'en-US': 'American App',
          'zh-Hans': 'Simplified Chinese App',
          ko: 'Korean App',
        },
      };

      withAppNameLocalization(configWithResources, options);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that Android locale format is used
      expect(fs.ensureDir).toHaveBeenCalledTimes(3);

      // Check all calls to ensureDir
      const calls = (fs.ensureDir as jest.MockedFunction<any>).mock.calls;
      const dirs = calls.map((call: any) => call[0]);

      expect(dirs.some((dir: string) => dir.includes('values-b+en+US'))).toBe(true);
      expect(dirs.some((dir: string) => dir.includes('values-b+zh+Hans'))).toBe(true);
      expect(dirs.some((dir: string) => dir.includes('values-b+ko'))).toBe(true);
    });
  });
});
