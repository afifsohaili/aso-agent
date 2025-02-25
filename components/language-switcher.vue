<script setup>
import { useI18n } from 'vue-i18n'

const { locale } = useI18n({ useScope: 'global' })
</script>

<template>
  <form>
    <select id="locale-select" v-model="locale">
      <option value="en">
        ENG
      </option>
      <option value="my">
        BM
      </option>
    </select>
  </form>
</template>
