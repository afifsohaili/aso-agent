<script setup>
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n({ useScope: 'global' })
</script>

<template>
  <form>
    <label for="locale-select">{{ t('language') }}: </label>
    <select id="locale-select" v-model="locale">
      <option value="en">
        en
      </option>
      <option value="my">
        my
      </option>
    </select>
  </form>
</template>
