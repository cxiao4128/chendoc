<script setup lang="ts">
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  Grid3X3,
  GripVertical,
  ImageIcon,
  ListOrdered,
  MapPin,
  MapPinned,
  PenTool,
  Plus,
  QrCode,
  SlidersHorizontal,
  Table2,
  Trash2,
  Upload
} from "lucide-vue-next";
import type { FormField } from "../../../features/forms";

defineProps<{
  draggingIndex: number | null;
}>();

const title = defineModel<string>("title", { required: true });
const description = defineModel<string>("description", { required: true });
const fields = defineModel<FormField[]>("fields", { required: true });
const selectedFieldId = defineModel<string | null>("selectedFieldId", { required: true });
const mobileEditStep = defineModel<"fields" | "settings" | "preview">("mobileEditStep", { required: true });
const mobileFieldPickerOpen = defineModel<boolean>("mobileFieldPickerOpen", { required: true });

defineEmits<{
  selectField: [id: string];
  deleteField: [id: string];
  moveField: [index: number, direction: "up" | "down"];
  dragStart: [index: number];
  dragOver: [event: DragEvent, index: number];
  drop: [event: DragEvent, index: number];
  dragEnd: [];
}>();
</script>

<template>
  <main class="form-canvas" :class="{ 'is-mobile-fields': mobileEditStep === 'fields', 'is-mobile-preview': mobileEditStep === 'preview' }">
    <div class="form-canvas__inner">
      <div class="form-canvas__header">
        <input v-model="title" class="form-canvas__title-input" placeholder="请添加标题" />
        <textarea v-model="description" class="form-canvas__desc-input" placeholder="添加描述：文字、图片或链接" rows="2"></textarea>
      </div>

      <div class="form-fields-list">
        <div
          v-for="(field, index) in fields"
          :key="field.id"
          class="form-field-item"
          :class="{ selected: selectedFieldId === field.id, dragging: draggingIndex === index }"
          draggable="true"
          @click="$emit('selectField', field.id)"
          @dragstart="$emit('dragStart', index)"
          @dragover="$emit('dragOver', $event, index)"
          @drop="$emit('drop', $event, index)"
          @dragend="$emit('dragEnd')"
        >
          <div class="form-field-item__drag">
            <GripVertical :size="16" />
          </div>
          <div class="form-field-item__content">
            <div class="form-field-item__header">
              <span class="form-field-item__label">{{ field.label }}</span>
              <span v-if="field.required" class="form-field-item__required">必填</span>
            </div>
            <div class="form-field-item__preview">
              <template v-if="field.type === 'text' || field.type === 'name' || field.type === 'phone' || field.type === 'email' || field.type === 'idcard' || field.type === 'address'">
                <div class="form-field-preview">{{ field.placeholder || "请输入..." }}</div>
              </template>
              <template v-else-if="field.type === 'textarea'">
                <div class="form-field-preview form-field-preview--multiline">{{ field.placeholder || "请输入..." }}</div>
              </template>
              <template v-else-if="field.type === 'number' || field.type === 'age'">
                <div class="form-field-preview form-field-preview--number">
                  <span v-if="field.min !== undefined || field.max !== undefined" class="form-field-preview__range">
                    {{ field.min !== undefined ? field.min : "?" }} - {{ field.max !== undefined ? field.max : "?" }}
                  </span>
                  <span v-else>0</span>
                </div>
              </template>
              <template v-else-if="field.type === 'select'">
                <div class="form-field-preview radio">
                  {{ field.placeholder || "请选择" }}
                  <ChevronDown :size="14" />
                </div>
              </template>
              <template v-else-if="field.type === 'radio'">
                <div class="form-field-preview radio-group">
                  <div v-for="opt in (field.options || ['选项1', '选项2'])" :key="opt" class="form-field-preview__option">
                    <span class="form-field-preview__radio"></span>
                    {{ opt }}
                  </div>
                </div>
              </template>
              <template v-else-if="field.type === 'checkbox'">
                <div class="form-field-preview checkbox-group">
                  <div class="form-field-preview__option">
                    <span class="form-field-preview__checkbox"></span>
                    {{ field.label }}
                  </div>
                </div>
              </template>
              <template v-else-if="field.type === 'date' || field.type === 'datetime' || field.type === 'time'">
                <div class="form-field-preview">
                  <Calendar class="form-inline-icon" :size="14" />
                  {{ field.type === "date" ? "选择日期" : field.type === "time" ? "选择时间" : "选择日期和时间" }}
                </div>
              </template>
              <template v-else-if="field.type === 'rating'">
                <div class="form-field-preview rating-preview">★★★★★</div>
              </template>
              <template v-else-if="field.type === 'file'">
                <div class="form-field-preview">
                  <Upload class="form-inline-icon" :size="14" />
                  点击上传文件
                </div>
              </template>
              <template v-else-if="field.type === 'image'">
                <div class="form-field-preview image-preview">
                  <ImageIcon :size="20" />
                  <span>点击上传图片</span>
                </div>
              </template>
              <template v-else-if="field.type === 'location'">
                <div class="form-field-preview">
                  <MapPinned class="form-inline-icon" :size="14" />
                  点击获取位置
                </div>
              </template>
              <template v-else-if="field.type === 'signature'">
                <div class="form-field-preview signature-preview">
                  <PenTool class="form-inline-icon" :size="14" />
                  点击签名
                </div>
              </template>
              <template v-else-if="field.type === 'gender'">
                <div class="form-field-preview radio-group">
                  <div class="form-field-preview__option"><span class="form-field-preview__radio"></span>男</div>
                  <div class="form-field-preview__option"><span class="form-field-preview__radio"></span>女</div>
                  <div class="form-field-preview__option"><span class="form-field-preview__radio"></span>其他</div>
                </div>
              </template>
              <template v-else-if="field.type === 'section'">
                <div class="form-field-preview section-preview">分节标题</div>
              </template>
              <template v-else-if="field.type === 'city'">
                <div class="form-field-preview city-preview">
                  <MapPin class="form-inline-icon" :size="14" />
                  省份 / 城市
                </div>
              </template>
              <template v-else-if="field.type === 'scale'">
                <div class="form-field-preview scale-preview">
                  <SlidersHorizontal class="form-inline-icon" :size="14" />
                  滑动选择
                </div>
              </template>
              <template v-else-if="field.type === 'matrix' || field.type === 'matrix_text'">
                <div class="form-field-preview matrix-preview">
                  <Grid3X3 class="form-inline-icon" :size="14" />
                  矩阵选择题
                </div>
              </template>
              <template v-else-if="field.type === 'table'">
                <div class="form-field-preview table-preview">
                  <Table2 class="form-inline-icon" :size="14" />
                  表格填写
                </div>
              </template>
              <template v-else-if="field.type === 'sort'">
                <div class="form-field-preview sort-preview">
                  <ListOrdered class="form-inline-icon" :size="14" />
                  拖拽排序
                </div>
              </template>
              <template v-else-if="field.type === 'qrcode'">
                <div class="form-field-preview">
                  <QrCode class="form-inline-icon" :size="14" />
                  扫码填写
                </div>
              </template>
              <template v-else-if="field.type === 'multiselect'">
                <div class="form-field-preview checkbox-group">
                  <div v-for="opt in (field.options || ['选项1', '选项2'])" :key="opt" class="form-field-preview__option">
                    <span class="form-field-preview__checkbox"></span>
                    {{ opt }}
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="form-field-preview">{{ field.placeholder || "请输入..." }}</div>
              </template>
            </div>
          </div>
          <div class="form-field-item__actions">
            <button class="form-field-item__action-btn" type="button" :disabled="index === 0" @click.stop="$emit('moveField', index, 'up')">
              <ChevronUp :size="14" />
            </button>
            <button class="form-field-item__action-btn" type="button" :disabled="index === fields.length - 1" @click.stop="$emit('moveField', index, 'down')">
              <ChevronDown :size="14" />
            </button>
            <button class="form-field-item__action-btn delete" type="button" @click.stop="$emit('deleteField', field.id)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>

        <div v-if="fields.length === 0" class="form-canvas__empty">
          <FileText :size="40" />
          <p>添加第一个字段</p>
          <button class="cd-button primary" type="button" @click="mobileFieldPickerOpen = true"><Plus :size="16" />选择题型</button>
        </div>
      </div>

      <button v-if="fields.length > 0" class="form-canvas__add-btn" type="button" @click="mobileFieldPickerOpen = true">
        <Plus :size="16" />
        添加问题
      </button>
    </div>
  </main>
</template>
