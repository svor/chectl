/*********************************************************************
 * Copyright (c) 2020 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 **********************************************************************/

export const DEFAULT_CHE_IMAGE = 'quay.io/eclipse/che-server:nightly'
export const DEFAULT_CHE_OPERATOR_IMAGE = 'quay.io/eclipse/che-operator:nightly'
export const DEFAULT_CHE_KEYCLOAK_IMAGE = 'quay.io/eclipse/che-keycloak:nightly'
export const DEFAULT_CHE_POSTGRES_IMAGE = 'centos/postgresql-96-centos7:9.6'

export const DEFAULT_CHE_JWTPROXY_IMAGE = 'quay.io/eclipse/che-jwtproxy:fd94e60'
export const DEFAULT_CHE_PLUGIN_METADATA_BROKER_IMAGE = 'quay.io/eclipse/che-plugin-metadata-broker:v3.1.2'
export const DEFAULT_CHE_PLUGIN_ARTIFACTS_BROKER_IMAGE = 'quay.io/eclipse/che-plugin-artifacts-broker:v3.1.2'
export const DEFAULT_CHE_PVC_JOBS_IMAGE = 'centos:centos7'
export const UBI8_MINIMAL_IMAGE = 'registry.access.redhat.com/ubi8-minimal:8.1-409'

// This image should be updated manually when needed.
// Repository location: https://github.com/che-dockerfiles/che-cert-manager-ca-cert-generator-image
export const CA_CERT_GENERATION_JOB_IMAGE = 'quay.io/eclipse/che-cert-manager-ca-cert-generator:671342c'

export const CERT_MANAGER_NAMESPACE_NAME = 'cert-manager'
export const CHE_TLS_SECRET_NAME = 'che-tls'
