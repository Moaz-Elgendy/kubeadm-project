<div align="center">

# Kubernetes GitOps Platform

**A kubeadm cluster, CI host and GitOps delivery pipeline, built from bare VMs on one laptop and codified in Ansible.**

Push to Git. Jenkins builds, scans and publishes the image. Argo CD rolls it out. Prometheus and Grafana watch every node.

[![Live showcase](https://img.shields.io/badge/%E2%96%B6%20LIVE%20SHOWCASE-moaz--elgendy.github.io%2Fkubeadm--project-2ea44f?style=for-the-badge)](https://moaz-elgendy.github.io/kubeadm-project/)

![Kubernetes](https://img.shields.io/badge/Kubernetes-v1.35-326CE5?logo=kubernetes&logoColor=white)
![kubeadm](https://img.shields.io/badge/kubeadm-bootstrap-326CE5)
![containerd](https://img.shields.io/badge/containerd-2.2-575757?logo=containerd&logoColor=white)
![Flannel](https://img.shields.io/badge/Flannel-VXLAN-0A8FDC)
![Ansible](https://img.shields.io/badge/Ansible-IaC-EE0000?logo=ansible&logoColor=white)
![Jenkins](https://img.shields.io/badge/Jenkins-CI-D24939?logo=jenkins&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Trivy](https://img.shields.io/badge/Trivy-scan-1904DA?logo=aquasec&logoColor=white)
![Argo CD](https://img.shields.io/badge/Argo%20CD-GitOps-EF7B4D?logo=argo&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?logo=prometheus&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-F46800?logo=grafana&logoColor=white)
![KVM](https://img.shields.io/badge/KVM%2Flibvirt-VMs-FF6600)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1?logo=mysql&logoColor=white)

[![Watch the 42-second CI/CD run](docs/assets/ci-cd-demo-poster.png)](docs/assets/ci-cd-demo.mp4)

*Click to watch a real run: commit, Jenkins CI, Argo CD rollout, change live in the app.*

</div>

## At a glance

| | |
|---|---|
| **Platform** | Kubernetes **v1.35.9** on two KVM VMs (Debian 13), bootstrapped with kubeadm, containerd and Flannel, hosted on one i5-3230M laptop with 8 GB RAM |
| **Infrastructure as code** | **8 reusable Ansible roles** in two playbooks build the cluster and the CI host |
| **CI** | Jenkins shared library: build, Trivy scan (HIGH and CRITICAL), push `mk0230/shopapp:<build>`, commit the new tag to Git. **1.5 to 3 minutes** from commit to image |
| **CD** | Argo CD with auto-sync, self-heal and prune. **0 manual `kubectl apply` per release**; Jenkins never touches the cluster |
| **Observability** | kube-prometheus-stack with **node-exporter on every node** and Grafana dashboards |
| **Workload** | Node.js 22 and Express storefront, MySQL 8.4 StatefulSet on a local PV, probes, limits, NetworkPolicy, ResourceQuota |

## Architecture

![Architecture](docs/assets/architecture.svg)

A push to `main` fires a GitHub webhook. Jenkins on the server checks out the code, builds the image, scans it with Trivy, pushes `mk0230/shopapp:<BUILD_NUMBER>` to Docker Hub, then commits the new tag to `k8s/app/deployment.yaml` with `[ci skip]`. Argo CD watches `k8s/app` on `main` and syncs the change into the cluster. Git is the only source of truth. Nothing is exposed to the internet.

## See it working

<table>
<tr>
<td width="50%"><img src="docs/assets/jenkins-ci-run.png" alt="Jenkins stage view, build 7 green"><br><sub><b>Jenkins CI.</b> Checkout, BuildImage, UpdateManifestInGit, Trivy report archived.</sub></td>
<td width="50%"><img src="docs/assets/argocd-shopapp.png" alt="Argo CD shopapp application, Healthy and Synced"><br><sub><b>Argo CD.</b> Healthy and Synced to the commit Jenkins pushed.</sub></td>
</tr>
<tr>
<td colspan="2"><img src="docs/assets/app-before-after.png" alt="shopapp storefront before and after one commit"><br><sub><b>One commit, no manual deploy.</b> The same URL before and after Argo CD rolled the change out.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/grafana-node-exporter.png" alt="Grafana Node Exporter dashboard"><br><sub><b>Grafana.</b> Node Exporter dashboard for the worker (192.168.122.242:9100).</sub></td>
<td width="50%"><img src="docs/assets/cluster-ready.png" alt="Both nodes Ready on v1.35.9"><br><sub><b>Cluster.</b> Both nodes Ready on v1.35.9 after <code>k8s-setup.yml</code>.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/monitoring-pods.png" alt="Monitoring pods spread over both nodes"><br><sub><b>Monitoring pods</b> spread over both nodes.</sub></td>
<td width="50%"><img src="docs/assets/node-exporter-daemonset.png" alt="node-exporter DaemonSet 2/2"><br><sub><b>node-exporter DaemonSet,</b> 2/2, one pod per node.</sub></td>
</tr>
</table>

## How it works

### Infrastructure as code

Details in [`ansible/README.md`](ansible/README.md). Versions and addresses live in `ansible/group_vars/`.

| Playbook | Roles, in order | What happens |
|---|---|---|
| `k8s-setup.yml` | `apt-upgrade` | Patch all nodes, reboot only if required |
| | `k8s-cluster-creation` (+ `k8s-common`) | OS prep, containerd with `SystemdCgroup = true`, kubeadm init, Flannel v0.28.10 |
| | `kubectl` | Checksum-verified kubectl v1.35.9 on the control plane |
| | `k8s-cluster-join` (+ `k8s-common`) | Join the worker, create the MySQL PV directory |
| | label and taint tasks | Worker gets `project=shopapp` and `workload=shopapp:NoSchedule` |
| `jenkins-setup.yml` | `apt-upgrade`, `jenkins`, `docker`, `trivy` | CI host: Java 21 and Jenkins LTS, Docker, Trivy |

### CI (Jenkins)

[`jenkins/Jenkinsfile`](jenkins/Jenkinsfile) runs three stages on the built-in node, triggered by the GitHub push webhook:

1. **Checkout** a clean workspace.
2. **BuildImage** (`buildApp`): docker build, non-blocking Trivy scan with an archived HTML report, push to Docker Hub.
3. **UpdateManifestInGit** (`pushGithub`): rewrite the image tag in `k8s/app/deployment.yaml`, commit and push to `main`.

Both steps are a shared library in [`jenkins/vars/`](jenkins/vars). Every stage has `not { changelog '.*\\[ci skip\\].*' }` and the manifest commit ends in `[ci skip]`, so the pipeline cannot trigger itself.

### CD (Argo CD)

[`k8s/argocd/application.yaml`](k8s/argocd/application.yaml) points Argo CD at `k8s/app` on `main` with `automated` sync, `selfHeal: true` and `prune: true`. Manual drift in the cluster is reverted; objects removed from Git are removed from the cluster.

### Kubernetes workload

All manifests in [`k8s/app/`](k8s/app) are assembled by `kustomization.yaml`.

| Object | Name | Purpose |
|---|---|---|
| Namespace | `shopapp` | Isolation for the app |
| ResourceQuota | `shopapp-quota` | Caps pods at 4 (3 steady plus 1 rolling-update surge) |
| ConfigMap | `shopapp-config` | `DB_HOST`, `DB_USER`, `DB_NAME` |
| StorageClass, PersistentVolume | `local-storage`, `shopapp-mysql-pv` | Local storage pinned to the worker (`/mnt/mysql-data`) |
| StatefulSet and headless Service | `shopapp-db` | MySQL 8.4 with a 5Gi volumeClaimTemplate |
| Deployment | `shopapp` | 2 replicas, init container waits for MySQL, `/health` and `/ready` probes, non-root, 200m/500Mi requests |
| Service | `shopapp` | ClusterIP on port 3000 |
| NetworkPolicy | `shopapp-db-allow-app` | Only `app=shopapp` pods may reach MySQL on 3306 |
| Secret | `shopapp-db-secret` | Created with kubectl, never committed ([`secret.example.yaml`](k8s/app/secret.example.yaml) is a template) |

### Monitoring

[`k8s/monitoring/values.yaml`](k8s/monitoring/values.yaml) configures the `kube-prometheus-stack` Helm chart (Prometheus, Operator, Grafana, Alertmanager, kube-state-metrics). node-exporter runs as a DaemonSet, one pod per node, scraped at `<node-ip>:9100`. Every component tolerates the `NoSchedule` taints, so it runs on both the control plane and the tainted worker.

## Repository layout

```text
.
├── app/                    # Node.js storefront, Dockerfile, docker-compose.yml (local dev)
├── ansible/
│   ├── ansible.cfg
│   ├── inventory/hosts.ini
│   ├── group_vars/         # all.yml, k8s_cluster.yml
│   ├── k8s-setup.yml       # cluster playbook
│   ├── jenkins-setup.yml   # CI host playbook
│   └── roles/              # apt-upgrade, k8s-common, k8s-cluster-creation, k8s-cluster-join,
│                           # kubectl, jenkins, docker, trivy
├── jenkins/
│   ├── Jenkinsfile
│   └── vars/               # shared library: buildApp.groovy, pushGithub.groovy
├── k8s/
│   ├── app/                # shopapp manifests + kustomization (Argo CD source path)
│   ├── argocd/application.yaml
│   └── monitoring/values.yaml
└── docs/                   # GitHub Pages showcase: index.html, screenshots, demo video
```

## Run it yourself

**Prerequisites:** a Debian 13 host with libvirt/KVM, two Debian 13 VMs (`192.168.122.69` control plane, `192.168.122.242` worker), the host's SSH key authorised for `debian@` on both, and Ansible with `community.general` and `ansible.posix`. Adjust `ansible/inventory/hosts.ini` to your addresses.

1. Build the cluster and the CI host:
   ```bash
   cd ansible
   ansible-playbook k8s-setup.yml
   ansible-playbook jenkins-setup.yml -K
   ```
2. On the control plane, install Argo CD (pinned):
   ```bash
   kubectl create namespace argocd
   kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.6.1/manifests/install.yaml
   ```
3. Create the app namespace and its secret (never committed):
   ```bash
   kubectl create namespace shopapp
   kubectl -n shopapp create secret generic shopapp-db-secret \
     --from-literal=DB_PASSWORD=... --from-literal=MYSQL_ROOT_PASSWORD=...
   ```
4. Hand the app to Argo CD:
   ```bash
   kubectl apply -f k8s/argocd/application.yaml
   ```
5. Install monitoring:
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm upgrade --install monitoring prometheus-community/kube-prometheus-stack --version 92.17.0 -n monitoring --create-namespace -f k8s/monitoring/values.yaml
   ```
6. Configure Jenkins:
   - Credentials: `docker-hub` (Docker Hub user and token) and `github` (user and PAT with push access).
   - Manage Jenkins, System, Global Trusted Pipeline Libraries: name `shared-lib`, this repo, library path `jenkins/`.
   - Pipeline job from SCM with script path `jenkins/Jenkinsfile`.
   - GitHub webhook to `http://<jenkins-host>:8080/github-webhook/`.

Local development without a cluster: `cd app && docker compose up --build`.

## Troubleshooting highlights

| Problem | Root cause | Fix |
|---|---|---|
| App stuck in `Init:0/1`, Argo CD `Degraded` | `DB_HOST` in the ConfigMap named a Service that did not exist; the init wait loop hid the DNS error | Point `DB_HOST` at the headless Service `shopapp-db`. The ConfigMap now lives in the Argo-managed path, so fixes go through Git |
| Rolling update pod `Pending`: `0/2 nodes are available: 1 Insufficient cpu` | Requests of 1 CPU and 1Gi per pod on a 2 vCPU, ~2.9 GiB worker | Requests 200m/500Mi, limits 1 CPU/1Gi, quota raised from 3 to 4 pods |
| Pipeline could trigger itself through its own manifest commit | The push to `main` fired the webhook again | `[ci skip]` in the commit message plus a `changelog` condition on every stage |

## Skills demonstrated

- **Kubernetes:** kubeadm bootstrap, CNI, taints and tolerations, StatefulSets, local PVs, NetworkPolicy, quotas, probes, rolling updates.
- **Infrastructure as code:** idempotent Ansible roles, pinned versions, checksum-verified binaries, shared group variables.
- **CI/CD and GitOps:** declarative Jenkins pipeline, shared library, Argo CD auto-sync, build-loop prevention.
- **Security:** Trivy image scanning, non-root containers, secrets kept out of Git, database reachable only from app pods.
- **Observability:** kube-prometheus-stack, node-exporter DaemonSet, Grafana dashboards.
- **Linux and virtualization:** KVM/libvirt NAT networking, containerd, systemd services, SSH and socat access paths.

## Author

**Moaz Elgendy** · [GitHub](https://github.com/Moaz-Elgendy)
