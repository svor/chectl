/*********************************************************************
 * Copyright (c) 2020 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 **********************************************************************/

import * as Listr from 'listr'
import * as path from 'path'
import * as execa from 'execa'
import { KubeHelper } from '../../api/kube'

export class DevfileRegistry {
  readonly DEVFILE_REGISTRY = 'devfile-registry'
  protected kubeHelper: KubeHelper
  protected cheNamespace: string
  protected templates: string
  protected domain: string
  protected image: string

  constructor(flags: any) {
    this.kubeHelper = new KubeHelper(flags)
    this.cheNamespace = flags.cheNamespace
    this.templates = flags.templates
    this.domain = flags.domain
    this.image = flags['offline-devfile-registry-image']
  }

  getInstallTasks(): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Checking if Devfile registry deployed',
        task: async (ctx: any, task: any) => {
          ctx.isDevfileRegistryDeployed = await this.kubeHelper.deploymentExist(this.DEVFILE_REGISTRY, this.cheNamespace)
          task.title = `${task.title}... done`
        }
      },
      {
        title: 'Deploying Devfile registry',
        task: async (ctx: any, task: any) => {
          const setOptions: string[] = []
          setOptions.push(`--set global.ingressDomain=${this.domain}`)
          setOptions.push(`--set cheDevfileRegistryImage=${this.image}`)
          setOptions.push('--set cheDevfileRegistryImagePullPolicy=IfNotPresent')
          setOptions.push('--set cheDevfileRegistryIngressSecretName=che-tls')
          setOptions.push(`--set cheDevfileImagesOverride.url=${ctx.dockerRegistryUrl}`)

          const destDir = path.join(this.templates, 'devfile-registry', 'kubernetes', 'che-devfile-registry')

          let command = `helm upgrade --install ${this.DEVFILE_REGISTRY} --namespace ${this.cheNamespace} ${setOptions.join(' ')} ${destDir}`

          let { exitCode, stderr } = await execa(command, { timeout: 120000, reject: false, shell: true })
          // if process failed, check the following
          // if revision=1, purge and retry command else rollback
          if (exitCode !== 0) {
            // get revision

            const { exitCode, stdout } = await execa(`helm history ${this.cheNamespace} --output json`, { timeout: 120000, reject: false, shell: true })
            if (exitCode !== 0) {
              throw new Error(`Unable to execute helm command ${command} / ${stderr}`)
            }
            let jsonOutput
            try {
              jsonOutput = JSON.parse(stdout)
            } catch (err) {
              throw new Error('Unable to grab helm history:' + err)
            }
            const revision = jsonOutput[0].revision
            if (jsonOutput.length > 0 && revision === '1') {
              // await this.purgeHelmChart(this.cheNamespace)
            } else {
              await execa('helm', ['rollback', this.cheNamespace, revision], { timeout: 120000 })

            }
            await execa(command, { timeout: 120000, shell: true })

          }
          task.title = `${task.title}... done`
        }
      },
      {
        title: 'Waiting for Devfile registry',
        task: async (ctx: any, task: any) => {
          await this.kubeHelper.waitForPodReady(this.DEVFILE_REGISTRY, this.cheNamespace)
          ctx.isDevfileRegistryReady = true
          task.title = `${task.title}... done`
        }
      },
    ]
  }

  getUpdateTasks(): ReadonlyArray<Listr.ListrTask> {
    return []
  }
}
