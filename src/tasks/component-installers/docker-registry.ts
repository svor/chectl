/*********************************************************************
 * Copyright (c) 2020 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 **********************************************************************/

import { V1beta1Ingress, V1Job } from '@kubernetes/client-node'
import axios, { AxiosInstance } from 'axios'
import { cli } from 'cli-ux'
import * as fs from 'fs'
import * as https from 'https'
import * as yaml from 'js-yaml'
import * as Listr from 'listr'
import * as path from 'path'
import { KubeHelper } from '../../api/kube'
import { DEFAULT_CHE_IMAGE, DEFAULT_CHE_JWTPROXY_IMAGE, DEFAULT_CHE_KEYCLOAK_IMAGE, DEFAULT_CHE_PLUGIN_ARTIFACTS_BROKER_IMAGE, DEFAULT_CHE_PLUGIN_METADATA_BROKER_IMAGE, DEFAULT_CHE_POSTGRES_IMAGE, DEFAULT_CHE_PVC_JOBS_IMAGE, UBI8_MINIMAL_IMAGE } from '../../constants'

export class DockerRegistry {
  readonly DOCKER_REGISTRY = 'docker-registry'
  readonly DOCKER_REGISTRY_SELECTOR = 'app=che,component=docker-registry'
  readonly DOCKER_REGISTRY_RESOURCES = ['configmap', 'pvc', 'service', 'ingress', 'deployment']

  protected kubeHelper: KubeHelper
  protected cheNamespace: string
  protected templates: string
  protected domain: string
  protected offlineStacks: string
  protected axiosInstance: AxiosInstance
  protected headers: any
  protected containerRegistryHostname: string

  constructor(flags: any) {
    this.kubeHelper = new KubeHelper(flags)
    this.cheNamespace = flags.chenamespace
    this.templates = flags.templates
    this.domain = flags.domain
    this.offlineStacks = flags['offline-stacks']
    this.headers = { 'Content-Type': 'text/plain' }
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    })
    this.containerRegistryHostname = `${this.DOCKER_REGISTRY}-${this.cheNamespace}.${this.domain}`
  }

  getInstallTasks(): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Checking if Docker registry deployed',
        task: async (ctx: any, task: any) => {
          ctx.isDockerRegistryDeployed = await this.kubeHelper.podsExistBySelector(this.DOCKER_REGISTRY_SELECTOR, this.cheNamespace)
          task.title = `${task.title}... done`
        }
      },
      {
        title: 'Deploying Docker registry',
        skip: (ctx: any) => ctx.isDockerRegistryDeployed,
        task: async (task: any) => {
          await this.syncConfigMap()
          await this.syncPVC()
          await this.syncService()
          await this.syncIngress()
          await this.syncDeployment()
          task.title = `${task.title}... done`
        }
      },
      {
        title: 'Waiting for Docker registry',
        task: async (ctx: any, task: any) => {
          await this.kubeHelper.waitForPodReady(this.DOCKER_REGISTRY_SELECTOR, this.cheNamespace)
          ctx.containerRegistryHostname = this.containerRegistryHostname
          task.title = `${task.title}... done`
        }
      },
      {
        title: 'Coping images into Docker registry',
        task: async (task: any) => {
          const job = await this.syncJob()
          await this.kubeHelper.waitJob(job.metadata!.name!, this.cheNamespace, 10 * 60)
          await this.kubeHelper.deleteJob(job.metadata!.name!, this.cheNamespace)
          task.title = `${task.title}... done`
        }
      }
    ]
  }

  getUpdateTasks(): ReadonlyArray<Listr.ListrTask> {
    return []
  }

  private async syncConfigMap(): Promise<void> {
    const yamlData = this.readResource('docker-registry-configmap.yml')
    await this.kubeHelper.createConfigMap(this.cheNamespace, yamlData)
  }

  private async syncPVC(): Promise<void> {
    const yamlData = this.readResource('docker-registry-pvc.yml')
    await this.kubeHelper.createPersistentVolumeClaim(this.cheNamespace, yamlData)
  }

  private async syncService(): Promise<void> {
    const yamlData = this.readResource('docker-registry-service.yml')
    await this.kubeHelper.createService(this.cheNamespace, yamlData)
  }

  private async syncIngress(): Promise<void> {
    const yamlData = this.readResource('docker-registry-ingress.yml') as V1beta1Ingress
    yamlData.spec!.tls = [{ hosts: [this.domain], secretName: 'che-tls' }]
    yamlData.spec!.rules![0].host = this.containerRegistryHostname
    await this.kubeHelper.createIngress(this.cheNamespace, yamlData)
  }

  private async syncDeployment(): Promise<void> {
    const resourcePath = path.join(this.templates, 'docker-registry', 'docker-registry-deployment.yml')
    await this.kubeHelper.createDeploymentFromFile(resourcePath, this.cheNamespace)
  }

  private async syncJob(): Promise<V1Job> {
    const offlineImages = await this.getOfflineImages()
    const yamlData = this.readResource('docker-registry-job.yml') as V1Job
    yamlData.spec!.template!.spec!.containers![0].env = [
      { name: 'DOCKER_IMAGES', value: offlineImages },
      { name: 'DOCKER_REGISTRY', value: this.containerRegistryHostname },
    ]
    return this.kubeHelper.createJob(this.cheNamespace, yamlData)
  }

  private readResource(resource: string): any {
    const resourcePath = path.join(this.templates, 'docker-registry', resource)
    const yamlFile = fs.readFileSync(resourcePath)
    return yaml.safeLoad(yamlFile.toString())
  }

  private async getOfflineImages(): Promise<string> {
    const images: string[] = []
    images.push(DEFAULT_CHE_IMAGE)
    images.push(DEFAULT_CHE_KEYCLOAK_IMAGE)
    images.push(DEFAULT_CHE_POSTGRES_IMAGE)
    images.push(DEFAULT_CHE_JWTPROXY_IMAGE)
    images.push(DEFAULT_CHE_PVC_JOBS_IMAGE)
    images.push(UBI8_MINIMAL_IMAGE)
    images.push(DEFAULT_CHE_PLUGIN_ARTIFACTS_BROKER_IMAGE)
    images.push(DEFAULT_CHE_PLUGIN_METADATA_BROKER_IMAGE)

    const cheVersion = DEFAULT_CHE_IMAGE.split(':')[1]
    images.push(...await this.getStackImages(cheVersion))
    images.push(...await this.getEditorImages(cheVersion))
    return images.join(',')
  }

  private async getEditorImages(cheVersion: string): Promise<string[]> {
    const images: string[] = []
    const cheTheiaVersion = cheVersion === 'nightly' || cheVersion === 'latest' ? 'next' : cheVersion
    const cheMachineExecVersion = cheVersion === 'nightly' || cheVersion === 'latest' ? 'nightly' : cheVersion
    images.push(...await this.getImagesByPluginId(cheVersion, `eclipse/che-theia/${cheTheiaVersion}`))
    images.push(...await this.getImagesByPluginId(cheVersion, `eclipse/che-machine-exec-plugin/${cheMachineExecVersion}`))
    images.push(...await this.getImagesByPluginId(cheVersion, 'eclipse/cloud-shell/latest'))
    return images
  }

  private async getStackImages(cheVersion: string): Promise<string[]> {
    const images: string[] = []

    for (const stack of this.offlineStacks.split(',')) {
      const url = `https://raw.githubusercontent.com/eclipse/che-devfile-registry/${this.getCheBranch(cheVersion)}/devfiles/${stack}/devfile.yaml`
      try {
        const response = await this.axiosInstance.get(url, this.headers)
        const yamlData = yaml.safeLoad(response.data)
        if (yamlData.components) {
          for (const component of yamlData.components) {
            switch (component.type) {
              // tslint:disable: ter-indent
              case 'dockerimage':
                if (component.image) {
                  images.push(component.image)
                } else {
                  cli.warn(`Images for stack '${stack}', component '${component}' not found.`)
                }
                break
              case 'cheEditor':
              case 'chePlugin':
                if (component.id) {
                  images.push(...await this.getImagesByPluginId(cheVersion, component.id))
                } else {
                  cli.warn(`Images for stack '${stack}', component '${component}' not found. Unknown component id.`)
                }
                break
              default:
                cli.warn(`Failed to get image for stack: ${stack}, component: ${component}. Unsupported type: ${component.type}`)
            }
          }
        }
      } catch (error) {
        throw new Error(`Failed to get stack ${stack}, error: ${error}`)
      }
    }

    return images
  }

  private async getImagesByPluginId(cheVersion: string, pluginId: string): Promise<string[]> {
    const images: string[] = []
    if (pluginId.endsWith('/latest')) {
      const url = `https://raw.githubusercontent.com/eclipse/che-plugin-registry/${this.getCheBranch(cheVersion)}/v3/plugins/${pluginId}.txt`
      try {
        const response = await this.axiosInstance.get(url, this.headers)
        pluginId = pluginId.replace('/latest', `/${response.data.toString().trim()}`)
      } catch (error) {
        throw new Error(`Failed to get the latest version of the plugin '${pluginId}'. Error: ${error}`)
      }
    }

    const url = `https://raw.githubusercontent.com/eclipse/che-plugin-registry/${this.getCheBranch(cheVersion)}/v3/plugins/${pluginId}/meta.yaml`
    try {
      const response = await this.axiosInstance.get(url, this.headers)
      const yamlData = yaml.safeLoad(response.data)
      if (yamlData.spec.containers) {
        for (const container of yamlData.spec.containers) {
          if (container.image) {
            images.push(container.image)
          } else {
            cli.warn(`Images for plugin '${pluginId}' not found.`)
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to get the plugin: '${pluginId}. Error: ${error}'`)
    }

    return images
  }

  private getCheBranch(cheVersion: string): string {
    return cheVersion === 'latest' || cheVersion === 'nightly' ? 'master' : cheVersion
  }
}
