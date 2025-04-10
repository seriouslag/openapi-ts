import { existsSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { initConfigs } from '@hey-api/openapi-ts/internal';
import { readJson } from '@nx/devkit';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGeneratorOptions } from '../../test-utils';
import { generateClientCode } from '../../utils';
import generator, { updateTsConfig } from './index';
import {
  generateApi,
  generateNxProject,
  normalizeOptions,
  updatePackageJson,
} from './index';

vi.mock('@hey-api/openapi-ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@hey-api/openapi-ts/internal')>();
  return {
    ...actual,
    initConfigs: vi.fn((config: Parameters<typeof initConfigs>[0]) =>
      Promise.resolve([
        {
          input: config?.input ?? 'default-input',
          output: config?.output ?? 'default-output',
          plugins: config?.plugins ?? [],
        },
      ]),
    ),
  };
});

// Mock generateClientCode to prevent actual code generation
vi.mock('../../utils', async () => {
  const actual = (await vi.importActual(
    '../../utils',
  )) as typeof import('../../utils');
  return {
    ...actual,
    generateClientCode: vi.fn(),
  };
});

vi.mock('latest-version', () => ({
  default: vi.fn(() => '1.0.0'),
}));

const tempDirectory = 'temp-openapi-client';

describe('openapi-client generator', () => {
  beforeEach(() => {
    // Clear mocks
    vi.clearAllMocks();
  });

  afterAll(async () => {
    const tempDir = join(process.cwd(), tempDirectory);
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true });
    }
  });

  describe('normalizeOptions', () => {
    it('should normalize options with default values', async () => {
      const { options, specPath } = await getGeneratorOptions({
        name: 'test-api-1',
        tempDirectory,
      });
      const normalized = normalizeOptions(options);

      expect(normalized).toEqual({
        clientType: '@hey-api/client-fetch',
        plugins: [],
        projectDirectory: `${tempDirectory}/test-api-1`,
        projectName: 'test-api',
        projectRoot: `${tempDirectory}/test-api-1/test-api`,
        projectScope: '@test-api',
        specFile: specPath,
        tagArray: ['api', 'openapi'],
        tempFolder: options.tempFolderDir,
        test: 'none',
      });
    });

    it('should normalize options with custom directory and tags', async () => {
      const { options, specPath } = await getGeneratorOptions({
        name: 'test-api-2',
        tempDirectory,
      });

      const customOptions = {
        ...options,
        directory: 'custom-dir',
        tags: ['custom', 'tags'],
      };

      const normalized = normalizeOptions(customOptions);

      expect(normalized).toEqual({
        clientType: '@hey-api/client-fetch',
        plugins: [],
        projectDirectory: 'custom-dir',
        projectName: 'test-api',
        projectRoot: 'custom-dir/test-api',
        projectScope: '@test-api',
        specFile: specPath,
        tagArray: ['custom', 'tags'],
        tempFolder: options.tempFolderDir,
        test: 'none',
      });
    });
  });

  describe('generateNxProject', () => {
    it('should generate project configuration', async () => {
      const { options, tree } = await getGeneratorOptions({
        name: 'test-api-3',
        tempDirectory,
      });
      const normalizedOptions = normalizeOptions(options);

      generateNxProject({ clientPlugins: {}, normalizedOptions, tree });

      const config = readJson(
        tree,
        `${normalizedOptions.projectRoot}/project.json`,
      );
      expect(config).toBeDefined();
      expect(config.projectType).toBe('library');
      expect(config.targets.build).toBeDefined();
      expect(config.targets.generateApi).toBeDefined();
    });

    it('should generate project files', async () => {
      const { options, tree } = await getGeneratorOptions({
        name: 'test-api-4',
        tempDirectory,
      });
      const normalizedOptions = normalizeOptions(options);

      generateNxProject({ clientPlugins: {}, normalizedOptions, tree });

      expect(
        tree.exists(`${normalizedOptions.projectRoot}/tsconfig.json`),
      ).toBeTruthy();
      expect(
        tree.exists(`${normalizedOptions.projectRoot}/tsconfig.lib.json`),
      ).toBeTruthy();
      expect(
        tree.exists(`${normalizedOptions.projectRoot}/package.json`),
      ).toBeTruthy();
      expect(
        tree.exists(`${normalizedOptions.projectRoot}/README.md`),
      ).toBeTruthy();
    });
  });

  describe('generateApi', () => {
    it('should process and bundle the OpenAPI spec file', async () => {
      const { options, specPath, tree } = await getGeneratorOptions({
        name: 'test-api-5',
        tempDirectory,
      });
      const normalizedOptions = normalizeOptions(options);
      const { projectRoot } = normalizedOptions;

      await generateApi({
        client: '@hey-api/client-fetch',
        plugins: [],
        projectRoot,
        specFile: specPath,
        tempFolder: tempDirectory,
        tree,
      });

      expect(tree.exists(`${projectRoot}/api/spec.yaml`)).toBeTruthy();
    });

    it('should throw error for invalid spec file', async () => {
      const { options, tree } = await getGeneratorOptions({
        name: 'test-api-6',
        tempDirectory,
      });
      const normalizedOptions = normalizeOptions(options);
      const { projectRoot } = normalizedOptions;

      await expect(
        generateApi({
          client: '@hey-api/client-fetch',
          plugins: [],
          projectRoot,
          specFile: 'non-existent.yaml',
          tempFolder: tempDirectory,
          tree,
        }),
      ).rejects.toThrow();
    });
  });

  describe('updatePackageJson', () => {
    it('should update package.json with correct dependencies', async () => {
      const { options, tree } = await getGeneratorOptions({
        name: 'test-api-7',
        tempDirectory,
      });
      const normalizedOptions = normalizeOptions(options);
      const { projectName, projectRoot, projectScope } = normalizedOptions;

      // Create initial package.json
      tree.write(
        `${projectRoot}/package.json`,
        JSON.stringify({
          dependencies: {},
          devDependencies: {},
          name: `${projectScope}/${projectName}`,
        }),
      );

      // Create tsconfig.base.json
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {},
          },
        }),
      );

      await updatePackageJson({
        clientType: '@hey-api/client-fetch',
        projectRoot,
        tree,
      });

      const packageJson = readJson(tree, `${projectRoot}/package.json`);
      expect(packageJson.dependencies['@hey-api/client-fetch']).toBeDefined();
    });

    it('should update tsconfig with correct dependencies', async () => {
      const { options, tree } = await getGeneratorOptions({
        name: 'test-api-8',
        tempDirectory,
      });
      const normalizedOptions = normalizeOptions(options);
      const { projectName, projectRoot, projectScope } = normalizedOptions;

      // Create tsconfig.base.json
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {},
          },
        }),
      );

      updateTsConfig({
        clientPlugins: {
          '@tanstack/react-query': {
            tsConfigCompilerPaths: {
              'my-test-path': './src/index.ts',
            },
          },
        },
        projectName,
        projectRoot,
        projectScope,
        tree,
      });

      // Verify tsconfig.base.json was updated
      const tsconfig = readJson(tree, 'tsconfig.base.json');
      expect(
        tsconfig.compilerOptions.paths[`${projectScope}/${projectName}`],
      ).toBeDefined();
      expect(tsconfig.compilerOptions.paths['my-test-path']).toBeDefined();
    });

    it('should update package.json with axios dependencies when clientType is axios', async () => {
      const { options, tree } = await getGeneratorOptions({
        name: 'test-api-9',
        tempDirectory,
      });
      const normalizedOptions = normalizeOptions(options);
      const { projectName, projectRoot, projectScope } = normalizedOptions;

      // Create initial package.json
      tree.write(
        `${projectRoot}/package.json`,
        JSON.stringify({
          dependencies: {},
          devDependencies: {},
          name: `${projectScope}/${projectName}`,
        }),
      );

      await updatePackageJson({
        clientType: '@hey-api/client-axios',
        projectRoot,
        tree,
      });

      const packageJson = readJson(tree, `${projectRoot}/package.json`);
      expect(packageJson.dependencies.axios).toBeDefined();
    });
  });

  describe('generateClientCode', () => {
    it('should generate client code without errors', async () => {
      const { options, specPath } = await getGeneratorOptions({
        name: 'test-api-10',
        tempDirectory,
      });
      const normalizedOptions = normalizeOptions(options);
      const { clientType, plugins, projectRoot } = normalizedOptions;

      // Create necessary directories
      const fullProjectRoot = join(process.cwd(), projectRoot);
      if (!existsSync(fullProjectRoot)) {
        mkdirSync(fullProjectRoot, { recursive: true });
      }

      expect(() =>
        generateClientCode({
          clientType,
          outputPath: `${projectRoot}/src/generated`,
          plugins,
          specFile: specPath,
        }),
      ).not.toThrow();
    });
  });

  describe('full generator', () => {
    it('should run the full generator successfully', async () => {
      const { options, tree } = await getGeneratorOptions({
        name: 'test-api-11',
        tempDirectory,
      });
      const task = await generator(tree, options);
      expect(task).toBeDefined();

      // Verify project structure
      const normalizedOptions = normalizeOptions(options);
      const { projectRoot } = normalizedOptions;

      expect(tree.exists(`${projectRoot}/package.json`)).toBeTruthy();
      expect(tree.exists(`${projectRoot}/tsconfig.json`)).toBeTruthy();
      expect(tree.exists(`${projectRoot}/api/spec.yaml`)).toBeTruthy();
    });
  });
});
