# Ansible

Codifies the exact manual steps used to build the running cluster and the CI host.

## Playbooks

- `k8s-setup.yml` builds the two-node kubeadm cluster, in this order:
  1. `apt-upgrade` on all nodes (reboots only if `/var/run/reboot-required` exists and `apt_upgrade_reboot` is true).
  2. Control plane: `k8s-cluster-creation` (runs `k8s-common`, `kubeadm init`, kubeconfig for `debian`, pinned Flannel, waits for Ready, stores the join command as a fact), then `kubectl`.
  3. Workers: `k8s-cluster-join` (runs `k8s-common`, joins, creates `/mnt/mysql-data` for the MySQL local PV).
  4. Control plane: labels `project=shopapp` and taints `workload=shopapp:NoSchedule` on the worker, prints `kubectl get nodes -o wide`.
- `jenkins-setup.yml` runs on the server itself (localhost): `apt-upgrade` (never reboots), `jenkins` (Java 21 + Jenkins LTS), `docker` (adds `jenkins` to the docker group), `trivy`. Jenkins is restarted if the group membership changed.

## Roles

| Role | Purpose |
|------|---------|
| apt-upgrade | update, dist-upgrade, autoremove, optional reboot |
| k8s-common | modules, sysctls, swap off, containerd + CNI plugins (SystemdCgroup), kubelet + kubeadm (held) |
| k8s-cluster-creation | kubeadm init, Flannel v0.28.10, join command fact |
| k8s-cluster-join | kubeadm join, MySQL PV directory |
| kubectl | checksum-verified kubectl v1.35.9 + bash completion |
| jenkins, docker, trivy | CI host tooling |

Versions and addresses live in `group_vars/`.

## Run

```bash
cd ansible
ansible-playbook k8s-setup.yml
ansible-playbook jenkins-setup.yml -K
```

## Prerequisites

- Ansible on the server (192.168.1.5), collections `community.general` and `ansible.posix`.
- SSH key access to `debian@192.168.122.69` and `debian@192.168.122.242`, passwordless sudo on the VMs.
- sudo password for the server (`-K`) for the Jenkins play.
