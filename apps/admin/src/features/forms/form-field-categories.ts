import {
  Calendar,
  CheckSquare,
  CircleDot,
  CreditCard,
  FileText,
  Hash,
  List,
  Mail,
  MapPin,
  Phone,
  Square,
  Star as RatingIcon,
  Type as TextIcon,
  User
} from "lucide-vue-next";
import type { FieldCategory } from "./form-editor.types";

export const fieldCategories: Record<"basic" | "advanced" | "preset", FieldCategory> = {
  basic: {
    title: "常用字段",
    items: [
      { type: "text", name: "单行文本", desc: "短内容", icon: TextIcon, color: "text" },
      { type: "textarea", name: "多行文本", desc: "长内容", icon: FileText, color: "text" },
      { type: "number", name: "数字", desc: "数值范围", icon: Hash, color: "text" },
      { type: "radio", name: "单选题", desc: "选择一项", icon: CircleDot, color: "radio" },
      { type: "multiselect", name: "多选题", desc: "选择多项", icon: CheckSquare, color: "checkbox" },
      { type: "checkbox", name: "同意确认", desc: "单项勾选", icon: Square, color: "checkbox" },
      { type: "select", name: "下拉选择", desc: "下拉菜单", icon: List, color: "select" },
      { type: "date", name: "日期", desc: "选择日期", icon: Calendar, color: "date" },
      { type: "rating", name: "评分", desc: "1 到 5 星", icon: RatingIcon, color: "rating" }
    ]
  },
  advanced: {
    title: "结构",
    items: [{ type: "section", name: "分节标题", desc: "整理长表单", icon: FileText, color: "section" }]
  },
  preset: {
    title: "常用题库",
    items: [
      { type: "name", name: "姓名", desc: "输入姓名", icon: User, color: "text", tag: "常用" },
      { type: "phone", name: "手机号", desc: "手机号码", icon: Phone, color: "text", tag: "常用" },
      { type: "idcard", name: "身份证号", desc: "身份证号", icon: CreditCard, color: "text", tag: "常用" },
      { type: "gender", name: "性别", desc: "男、女、其他", icon: CircleDot, color: "radio", tag: "常用" },
      { type: "age", name: "年龄", desc: "输入年龄", icon: Hash, color: "text", tag: "常用" },
      { type: "address", name: "地址", desc: "详细地址", icon: MapPin, color: "text", tag: "常用" },
      { type: "email", name: "邮箱", desc: "邮箱地址", icon: Mail, color: "text", tag: "常用" }
    ]
  }
};
