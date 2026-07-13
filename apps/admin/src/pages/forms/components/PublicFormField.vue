<script setup lang="ts">
import type { FormField } from "../../../features/forms/types";
import type { PublicFormCityValue, PublicFormValue } from "../../../features/forms/hooks/usePublicForm";

const props = defineProps<{
  field: FormField;
  modelValue?: PublicFormValue;
  cityValue?: PublicFormCityValue;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: PublicFormValue];
  "update:cityValue": [value: PublicFormCityValue];
}>();

const provinces = [
  "北京市", "天津市", "上海市", "重庆市", "河北省", "山西省", "辽宁省", "吉林省", "黑龙江省",
  "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省", "湖北省", "湖南省",
  "广东省", "海南省", "四川省", "贵州省", "云南省", "陕西省", "甘肃省", "青海省", "内蒙古自治区",
  "广西壮族自治区", "西藏自治区", "宁夏回族自治区", "新疆维吾尔自治区"
];

const cities: Record<string, string[]> = {
  北京市: ["东城区", "西城区", "朝阳区", "丰台区", "石景山区", "海淀区", "门头沟区", "房山区", "通州区", "顺义区", "昌平区", "大兴区", "怀柔区", "平谷区", "密云区", "延庆区"],
  上海市: ["黄浦区", "徐汇区", "长宁区", "静安区", "普陀区", "虹口区", "杨浦区", "闵行区", "宝山区", "嘉定区", "浦东新区", "金山区", "松江区", "青浦区", "奉贤区", "崇明区"],
  广东省: ["广州市", "深圳市", "珠海市", "汕头市", "佛山市", "韶关市", "湛江市", "肇庆市", "江门市", "茂名市", "惠州市", "梅州市", "汕尾市", "河源市", "阳江市", "清远市", "东莞市", "中山市", "潮州市", "揭阳市", "云浮市"]
};

function inputType(field: FormField) {
  if (field.type === "datetime") return "datetime-local";
  if (field.type === "number" || field.type === "age") return "number";
  if (field.type === "date" || field.type === "time" || field.type === "email") return field.type;
  if (field.type === "phone") return "tel";
  if (field.type === "image") return "url";
  return "text";
}

function radioOptions(field: FormField) {
  return field.type === "gender" ? ["男", "女", "其他"] : field.options ?? [];
}

function inputValue(value: PublicFormValue | undefined) {
  return typeof value === "boolean" ? String(value) : value;
}

function updateValue(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value);
}

function updateCheckbox(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).checked);
}

function updateMultiselect(option: string, event: Event) {
  const current = Array.isArray(props.modelValue) ? props.modelValue : [];
  emit("update:modelValue", (event.target as HTMLInputElement).checked
    ? [...current, option]
    : current.filter((value) => value !== option));
}

function updateProvince(event: Event) {
  emit("update:cityValue", { province: (event.target as HTMLSelectElement).value, city: "" });
}

function updateCity(event: Event) {
  emit("update:cityValue", { province: props.cityValue?.province ?? "", city: (event.target as HTMLSelectElement).value });
}
</script>

<template>
  <section v-if="field.type === 'section'" class="public-form-section">
    <h2>{{ field.label }}</h2><p v-if="field.placeholder">{{ field.placeholder }}</p>
  </section>

  <div v-else-if="field.type === 'textarea'" class="public-form-field">
    <label :for="`field_${field.id}`">{{ field.label }}<span v-if="field.required">*</span></label>
    <textarea :id="`field_${field.id}`" :value="inputValue(modelValue)" rows="4" :required="field.required" :placeholder="field.placeholder" :maxlength="field.maxLength" @input="updateValue" />
  </div>

  <div v-else-if="field.type === 'select'" class="public-form-field">
    <label :for="`field_${field.id}`">{{ field.label }}<span v-if="field.required">*</span></label>
    <select :id="`field_${field.id}`" :value="inputValue(modelValue)" :required="field.required" @change="updateValue">
      <option value="">请选择</option><option v-for="option in field.options || []" :key="option" :value="option">{{ option }}</option>
    </select>
  </div>

  <fieldset v-else-if="field.type === 'radio' || field.type === 'gender'" class="public-form-field public-form-fieldset">
    <legend>{{ field.label }}<span v-if="field.required">*</span></legend>
    <label v-for="option in radioOptions(field)" :key="option" class="public-form-choice">
      <input type="radio" :name="field.id" :value="option" :checked="modelValue === option" :required="field.required" @change="updateValue"><span>{{ option }}</span>
    </label>
  </fieldset>

  <fieldset v-else-if="field.type === 'multiselect'" class="public-form-field public-form-fieldset">
    <legend>{{ field.label }}<span v-if="field.required">*</span></legend>
    <label v-for="option in field.options || []" :key="option" class="public-form-choice">
      <input type="checkbox" :value="option" :checked="Array.isArray(modelValue) && modelValue.includes(option)" @change="updateMultiselect(option, $event)"><span>{{ option }}</span>
    </label>
  </fieldset>

  <label v-else-if="field.type === 'checkbox'" class="public-form-field public-form-choice public-form-choice--single">
    <input type="checkbox" :checked="modelValue === true" :required="field.required" @change="updateCheckbox"><span>{{ field.label }}<b v-if="field.required">*</b></span>
  </label>

  <fieldset v-else-if="field.type === 'rating'" class="public-form-field public-form-fieldset">
    <legend>{{ field.label }}<span v-if="field.required">*</span></legend>
    <div class="public-form-rating">
      <label v-for="rating in [1, 2, 3, 4, 5]" :key="rating">
        <input type="radio" :name="field.id" :value="rating" :checked="Number(modelValue) === rating" :required="field.required" @change="emit('update:modelValue', rating)">
        <span aria-hidden="true">★</span><span class="public-form-sr-only">{{ rating }} 星</span>
      </label>
    </div>
  </fieldset>

  <div v-else-if="field.type === 'city'" class="public-form-field">
    <label :for="`field_${field.id}_province`">{{ field.label }}<span v-if="field.required">*</span></label>
    <div class="public-form-city">
      <select :id="`field_${field.id}_province`" :value="cityValue?.province" :required="field.required" @change="updateProvince">
        <option value="">请选择省份</option><option v-for="province in provinces" :key="province" :value="province">{{ province }}</option>
      </select>
      <select :value="cityValue?.city" :disabled="!cityValue?.province" @change="updateCity">
        <option value="">请选择城市</option><option v-for="city in cities[cityValue?.province || ''] || []" :key="city" :value="city">{{ city }}</option>
      </select>
    </div>
  </div>

  <div v-else class="public-form-field">
    <label :for="`field_${field.id}`">{{ field.label }}<span v-if="field.required">*</span></label>
    <input :id="`field_${field.id}`" :value="inputValue(modelValue)" :type="inputType(field)" :required="field.required" :placeholder="field.placeholder || (field.type === 'image' ? '请输入图片链接' : undefined)" :maxlength="field.maxLength" :min="field.min" :max="field.max" :pattern="field.type === 'phone' ? '1[3-9]\\d{9}' : field.type === 'idcard' ? '(?:\\d{15}|\\d{17}[\\dXx])' : undefined" @input="updateValue">
  </div>
</template>
