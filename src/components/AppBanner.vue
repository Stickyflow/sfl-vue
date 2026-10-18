<template>
  <p class="banner banner--error" role="alert"><slot /></p>
</template>

<style scoped>
.banner {
  margin: 0 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
}

.banner--error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
</style>
