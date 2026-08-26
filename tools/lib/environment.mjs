const REQUIRED_ENVIRONMENTS = ['local', 'staging', 'production'];

export function validateEnvironmentContract(contract) {
  const errors = [];
  if (contract?.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (contract?.product !== 'FranchiseHQ') errors.push('product must be FranchiseHQ.');

  const pages = contract?.pages || {};
  const worker = contract?.importWorker || {};
  const bindings = [...(pages.bindings || []), ...(worker.bindings || [])];
  const requiredBindings = bindings.filter(binding => binding.required && !binding.platformManaged);
  const requiredSecrets = [...(pages.secrets || []), ...(worker.secrets || [])];
  const requiredVariables = pages.variables || [];

  for (const name of REQUIRED_ENVIRONMENTS) {
    const environment = contract?.environments?.[name];
    if (!environment) {
      errors.push(`Missing ${name} environment.`);
      continue;
    }
    if (!environment.resourceNamespace) errors.push(`${name} is missing resourceNamespace.`);

    for (const binding of requiredBindings) {
      if (!environment.resources?.[binding.name]) {
        errors.push(`${name} is missing resource binding ${binding.name}.`);
      }
    }
    for (const variable of requiredVariables) {
      if (!environment.variables?.[variable]) {
        errors.push(`${name} is missing variable ${variable}.`);
      }
    }
    for (const secret of requiredSecrets) {
      if (!environment.secretNames?.includes(secret)) {
        errors.push(`${name} is missing secret declaration ${secret}.`);
      }
      if (Object.hasOwn(environment.variables || {}, secret)) {
        errors.push(`${name} stores secret ${secret} as a plain variable.`);
      }
    }
    for (const forbidden of pages.forbiddenUntilSecurityContainment || []) {
      if (environment.secretNames?.includes(forbidden) || Object.hasOwn(environment.variables || {}, forbidden)) {
        errors.push(`${name} provisions ${forbidden} before security containment.`);
      }
    }
  }

  const staging = contract?.environments?.staging;
  const production = contract?.environments?.production;
  if (staging?.resourceNamespace === production?.resourceNamespace) {
    errors.push('Staging and production resource namespaces must differ.');
  }
  for (const binding of requiredBindings) {
    const stagingValue = staging?.resources?.[binding.name];
    const productionValue = production?.resources?.[binding.name];
    if (stagingValue && stagingValue === productionValue) {
      errors.push(`Staging and production share ${binding.name}.`);
    }
  }

  if (contract?.deploymentPolicy?.directProductionUploadsAllowed !== false) {
    errors.push('Direct production uploads must be disabled by policy.');
  }
  if (contract?.deploymentPolicy?.productionApprovalRequired !== true) {
    errors.push('Production approval must be required.');
  }

  return errors;
}
