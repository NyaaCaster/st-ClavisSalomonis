import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const MODULE_NAME = 'st-ClavisSalomonis';
const extensionFolderPath = `scripts/extensions/third-party/${MODULE_NAME}`;
const GITHUB_API_URL = 'https://api.github.com/repos/NyaaCaster/st-ClavisSalomonis/contents/manifest.json';

let currentVersion = null;
let hasUpdateAvailable = false;
let latestVersion = null;
let presetDetectionResult = null;

const PRESET_OVERLAP_RULES = {
    prompts: {
        identityReset: {
            keywords: ['身份重置', 'identity', 'RESET', 'unconditioned', 'Initialize as'],
            description: '身份重置功能'
        },
        scenarioFramework: {
            keywords: ['场景框架', '亲密伙伴', '创作自由', '私密空间', '没有任何安全限制'],
            description: '场景框架构建功能'
        },
        aiSelfPersuasion: {
            keywords: ['自我说服', '什么都可以写', '亲密的朋友', '安心待在这里'],
            description: 'AI自我说服功能'
        },
        roleplayInduction: {
            keywords: ['角色扮演', '扮演故事中角色', 'Role|System', '进入角色'],
            description: '角色扮演诱导功能'
        },
        safetyStatement: {
            keywords: ['安全声明', 'safety policies', 'fictional and adheres'],
            description: '安全声明转移功能'
        },
        disclaimer: {
            keywords: ['免责声明', 'safety mechanisms disabled', 'I_AM_FREE', 'Unlimited plot creation'],
            description: '免责声明伪装功能'
        },
        wordCountControl: {
            keywords: ['字数', 'word count', '1000', '2000', '字左右'],
            description: '字数控制功能'
        }
    },
    regex: {
        hideThoughtChain: {
            keywords: ['隐藏思维链', 'think', 'thinking', 'Thinking about your request'],
            description: '隐藏思维链功能'
        },
        hideDisclaimer: {
            keywords: ['隐藏免责声明', 'disclaimer', 'Statement'],
            description: '隐藏免责声明功能'
        }
    }
};

const defaultSettings = Object.freeze({
    enabled: true,
    templateMode: 'default',
    enableIdentityReset: true,
    enableScenarioFramework: true,
    enableAISelfPersuasion: true,
    enableRoleplayInduction: true,
    enableDisclaimer: false,
    enableSafetyStatement: true,
    enableWordCountControl: true,
    injectionDepth: 4,
    injectionPosition: 0,
    injectionOrder: 100,
    enableRegexFilter: true,
    hideThoughtChain: true,
    hideDisclaimer: true,
    customTemplates: null,
    language: 'zh-cn'
});

let defaultTemplateConfig = null;
let templateConfig = null;
let regexPatterns = null;
let bypassTemplates = null;
let i18nData = null;

async function loadI18n(lang) {
    try {
        const response = await fetch(`/scripts/extensions/third-party/${MODULE_NAME}/i18n/${lang}.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        i18nData = await response.json();
        return i18nData;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to load i18n for ${lang}:`, error);
        return null;
    }
}

function t(key, defaultText) {
    if (i18nData && i18nData[key]) {
        return i18nData[key];
    }
    return defaultText || key;
}

function applyI18n() {
    const $container = $('.clavis-salomonis-settings');
    
    $container.find('[data-i18n]').each(function() {
        const key = $(this).attr('data-i18n');
        const defaultText = $(this).text();
        $(this).text(t(key, defaultText));
    });
    
    $container.find('[data-i18n-value]').each(function() {
        const key = $(this).attr('data-i18n-value');
        const defaultText = $(this).attr('value');
        const icon = defaultText.match(/^[^\s]+\s*/)?.[0] || '';
        const text = t(key, defaultText.replace(/^[^\s]+\s*/, ''));
        $(this).attr('value', icon + text);
    });
    
    $container.find('[data-i18n-title]').each(function() {
        const key = $(this).attr('data-i18n-title');
        const defaultText = $(this).attr('title');
        $(this).attr('title', t(key, defaultText));
    });
}

function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    const maxLength = Math.max(parts1.length, parts2.length);
    
    for (let i = 0; i < maxLength; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

async function getLocalVersion() {
    try {
        const response = await fetch(`/scripts/extensions/third-party/${MODULE_NAME}/manifest.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const manifest = await response.json();
        currentVersion = manifest.version;
        return currentVersion;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to fetch local version:`, error);
        currentVersion = '0.0.0';
        return currentVersion;
    }
}

async function getLatestVersion() {
    try {
        const response = await fetch(GITHUB_API_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const content = atob(data.content);
        const manifest = JSON.parse(content);
        latestVersion = manifest.version;
        return latestVersion;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to fetch latest version:`, error);
        return null;
    }
}

async function checkForUpdate() {
    await getLocalVersion();
    
    if (currentVersion) {
        $('#clavis_version_number').text(currentVersion);
    }
    
    const remoteVersion = await getLatestVersion();
    const $statusEl = $('#clavis_remote_version_status');
    
    if (remoteVersion && currentVersion) {
        hasUpdateAvailable = compareVersions(remoteVersion, currentVersion) > 0;
        console.log(`[${MODULE_NAME}] Version check: local=${currentVersion}, remote=${remoteVersion}, hasUpdate=${hasUpdateAvailable}`);
        
        if (hasUpdateAvailable) {
            showUpdateBadge();
            $statusEl.html(`<span style="color: #e74c3c;">最新: ${remoteVersion}</span>`);
        } else {
            $statusEl.html(`<span style="color: #2ecc71;">已是最新版本</span>`);
        }
    } else {
        $statusEl.html(`<span style="color: #888;">版本检查失败</span>`);
    }
    
    return hasUpdateAvailable;
}

function showUpdateBadge() {
    $('#clavis_title_badge').addClass('show');
    $('#clavis_version_badge').addClass('show');
}

function detectPresetOverlap() {
    const context = SillyTavern.getContext();
    const result = {
        hasPreset: false,
        presetName: null,
        overlaps: {
            prompts: {},
            regex: {}
        },
        recommendations: []
    };
    
    if (!context || !context.settings || !context.settings.preset) {
        return result;
    }
    
    const preset = context.settings.preset;
    result.hasPreset = true;
    result.presetName = preset.name || '未知预设';
    
    if (preset.prompts && Array.isArray(preset.prompts)) {
        for (const prompt of preset.prompts) {
            if (!prompt.content || prompt.enabled === false) continue;
            
            for (const [key, rule] of Object.entries(PRESET_OVERLAP_RULES.prompts)) {
                for (const keyword of rule.keywords) {
                    if (prompt.content.toLowerCase().includes(keyword.toLowerCase())) {
                        if (!result.overlaps.prompts[key]) {
                            result.overlaps.prompts[key] = {
                                description: rule.description,
                                matchedPrompts: []
                            };
                        }
                        result.overlaps.prompts[key].matchedPrompts.push(prompt.name || prompt.identifier);
                        break;
                    }
                }
            }
        }
    }
    
    if (preset.extensions && preset.extensions.regex_scripts && Array.isArray(preset.extensions.regex_scripts)) {
        for (const script of preset.extensions.regex_scripts) {
            if (!script.findRegex) continue;
            
            for (const [key, rule] of Object.entries(PRESET_OVERLAP_RULES.regex)) {
                for (const keyword of rule.keywords) {
                    if (script.findRegex.toLowerCase().includes(keyword.toLowerCase()) ||
                        (script.scriptName && script.scriptName.includes(keyword))) {
                        if (!result.overlaps.regex[key]) {
                            result.overlaps.regex[key] = {
                                description: rule.description,
                                matchedScripts: []
                            };
                        }
                        result.overlaps.regex[key].matchedScripts.push(script.scriptName || '未命名脚本');
                        break;
                    }
                }
            }
        }
    }
    
    const promptOverlaps = Object.keys(result.overlaps.prompts);
    const regexOverlaps = Object.keys(result.overlaps.regex);
    
    if (promptOverlaps.length > 0) {
        result.recommendations.push(`检测到预设已包含以下功能: ${promptOverlaps.map(k => result.overlaps.prompts[k].description).join('、')}`);
        result.recommendations.push('建议禁用扩展中对应的提示词配置以避免重复');
    }
    
    if (regexOverlaps.length > 0) {
        result.recommendations.push(`检测到预设已包含以下正则过滤: ${regexOverlaps.map(k => result.overlaps.regex[k].description).join('、')}`);
    }
    
    presetDetectionResult = result;
    console.log(`[${MODULE_NAME}] Preset detection result:`, result);
    
    return result;
}

function updatePresetDetectionUI() {
    const $warning = $('#clavis_preset_warning');
    const $info = $('#clavis_preset_info');
    
    if (!presetDetectionResult) {
        $warning.hide();
        $info.hide();
        return;
    }
    
    const promptOverlaps = Object.keys(presetDetectionResult.overlaps.prompts);
    const regexOverlaps = Object.keys(presetDetectionResult.overlaps.regex);
    
    if (promptOverlaps.length > 0 || regexOverlaps.length > 0) {
        let warningHtml = `<strong>⚠️ 预设兼容性提示</strong><br>`;
        warningHtml += `当前预设: <code>${presetDetectionResult.presetName}</code><br>`;
        
        if (promptOverlaps.length > 0) {
            warningHtml += `<br><strong>提示词重叠:</strong><ul>`;
            for (const key of promptOverlaps) {
                const overlap = presetDetectionResult.overlaps.prompts[key];
                warningHtml += `<li>${overlap.description} (预设条目: ${overlap.matchedPrompts.join(', ')})</li>`;
                
                const $checkbox = $(`#clavis_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`);
                if ($checkbox.length && $checkbox.prop('checked')) {
                    $checkbox.closest('.clavis_block').addClass('preset-overlap');
                }
            }
            warningHtml += `</ul>`;
        }
        
        if (regexOverlaps.length > 0) {
            warningHtml += `<br><strong>正则过滤重叠:</strong><ul>`;
            for (const key of regexOverlaps) {
                const overlap = presetDetectionResult.overlaps.regex[key];
                warningHtml += `<li>${overlap.description}</li>`;
            }
            warningHtml += `</ul>`;
        }
        
        $warning.html(warningHtml).show();
    } else if (presetDetectionResult.hasPreset) {
        $info.html(`✅ 当前预设 <code>${presetDetectionResult.presetName}</code> 与扩展无功能重叠`).show();
        $warning.hide();
    } else {
        $warning.hide();
        $info.hide();
    }
}

async function loadDefaultTemplateConfig() {
    if (defaultTemplateConfig) {
        return defaultTemplateConfig;
    }
    
    try {
        const response = await fetch(`/scripts/extensions/third-party/${MODULE_NAME}/templates.json`);
        defaultTemplateConfig = await response.json();
        console.log(`[${MODULE_NAME}] Default template config loaded`);
        return defaultTemplateConfig;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to load default template config:`, error);
        throw error;
    }
}

async function loadTemplateConfig() {
    const settings = getSettings();
    
    await loadDefaultTemplateConfig();
    
    if (settings.templateMode === 'custom' && settings.customTemplates) {
        templateConfig = settings.customTemplates;
        console.log(`[${MODULE_NAME}] Using custom templates`);
    } else {
        templateConfig = defaultTemplateConfig;
        console.log(`[${MODULE_NAME}] Using default templates`);
    }
    
    regexPatterns = {};
    for (const [key, value] of Object.entries(templateConfig.regexPatterns)) {
        try {
            regexPatterns[key] = {
                name: value.name,
                pattern: new RegExp(value.pattern, value.flags),
                description: value.description
            };
        } catch (error) {
            console.error(`[${MODULE_NAME}] Failed to compile regex pattern '${key}':`, error);
            toastr.error(`Invalid regex pattern: ${key}`, 'Template Error');
        }
    }
    
    bypassTemplates = {};
    for (const [key, value] of Object.entries(templateConfig.templates)) {
        bypassTemplates[key] = value.content;
    }
    
    return templateConfig;
}

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[MODULE_NAME], key)) {
            extension_settings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    
    return extension_settings[MODULE_NAME];
}

function replaceVariables(template) {
    return template
        .replace(/\{\{identity\}\}/g, 'AI助手')
        .replace(/\{\{identityName\}\}/g, 'AI助手')
        .replace(/\{\{userName\}\}/g, '用户')
        .replace(/\{\{userNameName\}\}/g, '用户');
}

function buildBypassPrompt(settings) {
    const prompts = [];
    
    if (!bypassTemplates || !templateConfig) {
        console.warn(`[${MODULE_NAME}] Templates not loaded yet`);
        return prompts;
    }
    
    for (const [key, template] of Object.entries(templateConfig.templates)) {
        const configKey = template.configKey;
        if (settings[configKey] && bypassTemplates[key]) {
            prompts.push({
                role: template.role,
                content: replaceVariables(bypassTemplates[key])
            });
        }
    }
    
    return prompts;
}

globalThis.clavisSalomonisInterceptor = async function(chat, contextSize, abort, type) {
    const settings = getSettings();
    
    if (!settings.enabled) {
        return;
    }
    
    console.log(`[${MODULE_NAME}] Interceptor triggered. Type: ${type}, Context size: ${contextSize}`);
    
    const bypassPrompts = buildBypassPrompt(settings);
    
    if (bypassPrompts.length > 0) {
        const injectionPoint = Math.max(0, Math.min(chat.length - 1, settings.injectionPosition));
        
        for (let i = bypassPrompts.length - 1; i >= 0; i--) {
            const prompt = bypassPrompts[i];
            const systemNote = {
                is_user: false,
                is_system: true,
                name: prompt.role === 'assistant' ? 'Assistant' : 'System',
                send_date: Date.now(),
                mes: prompt.content
            };
            chat.splice(injectionPoint, 0, systemNote);
        }
        
        console.log(`[${MODULE_NAME}] Injected ${bypassPrompts.length} bypass prompts at position ${injectionPoint}`);
    }
};

export async function onInstall() {
    console.log(`[${MODULE_NAME}] Extension installed. Initializing default settings...`);
    const settings = getSettings();
    saveSettingsDebounced();
}

export async function onActivate() {
    console.log(`[${MODULE_NAME}] Extension activated during page load`);
    await loadTemplateConfig();
    registerRegexFilter();
}

function registerRegexFilter() {
    const context = SillyTavern.getContext();
    const { eventSource, event_types } = context;
    
    if (eventSource && event_types) {
        eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
            applyRegexFilter(messageId);
        });
        
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            applyRegexFilter(messageId);
        });
        
        console.log(`[${MODULE_NAME}] Regex filter registered`);
    }
}

function applyRegexFilter(messageId) {
    const settings = getSettings();
    
    if (!settings.enabled || !settings.enableRegexFilter || !regexPatterns) {
        return;
    }
    
    const context = SillyTavern.getContext();
    const chat = context.chat;
    
    if (!chat || !chat[messageId]) {
        return;
    }
    
    const message = chat[messageId];
    let filtered = false;
    
    if (settings.hideThoughtChain && regexPatterns.hideThoughtChain) {
        if (regexPatterns.hideThoughtChain.pattern.test(message.mes)) {
            message.mes = message.mes.replace(regexPatterns.hideThoughtChain.pattern, '');
            filtered = true;
            console.log(`[${MODULE_NAME}] Filtered thought chain content`);
        }
    }
    
    if (settings.hideDisclaimer && regexPatterns.hideDisclaimer) {
        if (regexPatterns.hideDisclaimer.pattern.test(message.mes)) {
            message.mes = message.mes.replace(regexPatterns.hideDisclaimer.pattern, '');
            filtered = true;
            console.log(`[${MODULE_NAME}] Filtered disclaimer content`);
        }
    }
    
    if (filtered) {
        console.log(`[${MODULE_NAME}] Regex filter applied to message ${messageId}`);
    }
}

export function onEnable() {
    console.log(`[${MODULE_NAME}] Extension enabled`);
    toastr.success('ClavisSalomonis extension enabled', 'Extension Status');
}

export function onDisable() {
    console.log(`[${MODULE_NAME}] Extension disabled`);
    toastr.info('ClavisSalomonis extension disabled', 'Extension Status');
}

function updateTemplateEditorVisibility() {
    const settings = getSettings();
    const $editor = $('#clavis_template_editor');
    
    if (settings.templateMode === 'custom') {
        $editor.show();
        loadTemplateEditor();
    } else {
        $editor.hide();
    }
}

function loadTemplateEditor() {
    const settings = getSettings();
    const config = settings.customTemplates || defaultTemplateConfig;
    
    if (!config || !config.templates) return;
    
    for (const [key, template] of Object.entries(config.templates)) {
        $(`#clavis_template_${key}`).val(template.content);
    }
}

function saveCustomTemplates() {
    const settings = getSettings();
    
    if (!settings.customTemplates) {
        settings.customTemplates = structuredClone(defaultTemplateConfig);
    }
    
    for (const key of Object.keys(settings.customTemplates.templates)) {
        const content = $(`#clavis_template_${key}`).val();
        if (content !== undefined) {
            settings.customTemplates.templates[key].content = content;
        }
    }
    
    saveSettingsDebounced();
    loadTemplateConfig();
    toastr.success('自定义模板已保存', '保存成功');
    console.log(`[${MODULE_NAME}] Custom templates saved`);
}

function resetCustomTemplates() {
    const settings = getSettings();
    settings.customTemplates = structuredClone(defaultTemplateConfig);
    saveSettingsDebounced();
    loadTemplateEditor();
    loadTemplateConfig();
    toastr.info('自定义模板已重置为默认值', '重置成功');
    console.log(`[${MODULE_NAME}] Custom templates reset to default`);
}

function exportTemplates() {
    const settings = getSettings();
    const config = settings.customTemplates || defaultTemplateConfig;
    
    if (!config) {
        toastr.error('没有可导出的模板', '导出失败');
        return;
    }
    
    const exportData = JSON.stringify(config, null, 2);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `clavis-salomonis-templates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toastr.success('模板已导出', '导出成功');
    console.log(`[${MODULE_NAME}] Templates exported`);
}

function importTemplates() {
    $('#clavis_import_file').click();
}

function validateTemplateConfig(config) {
    const errors = [];
    
    if (typeof config !== 'object' || config === null) {
        errors.push('配置必须是一个有效的JSON对象');
        return errors;
    }
    
    if (!config.variables || typeof config.variables !== 'object') {
        errors.push('缺少 variables 字段或格式不正确');
    } else {
        if (!config.variables.identity || !config.variables.userName) {
            errors.push('variables 必须包含 identity 和 userName 字段');
        }
    }
    
    if (!config.regexPatterns || typeof config.regexPatterns !== 'object') {
        errors.push('缺少 regexPatterns 字段或格式不正确');
    } else {
        if (!config.regexPatterns.hideThoughtChain || !config.regexPatterns.hideDisclaimer) {
            errors.push('regexPatterns 必须包含 hideThoughtChain 和 hideDisclaimer 字段');
        } else {
            for (const [key, value] of Object.entries(config.regexPatterns)) {
                if (!value.pattern || !value.flags) {
                    errors.push(`regexPatterns.${key} 缺少 pattern 或 flags 字段`);
                }
            }
        }
    }
    
    if (!config.templates || typeof config.templates !== 'object') {
        errors.push('缺少 templates 字段或格式不正确');
    } else {
        const requiredTemplates = [
            'identityReset', 'scenarioFramework', 'aiSelfPersuasion',
            'roleplayInduction', 'safetyStatement', 'disclaimer', 'wordCountControl'
        ];
        for (const key of requiredTemplates) {
            if (!config.templates[key]) {
                errors.push(`templates 缺少 ${key} 字段`);
            } else {
                const template = config.templates[key];
                if (!template.name || !template.configKey || !template.role || !template.content) {
                    errors.push(`templates.${key} 缺少必要字段 (name, configKey, role, content)`);
                }
                if (template.role !== 'system' && template.role !== 'assistant') {
                    errors.push(`templates.${key}.role 必须是 'system' 或 'assistant'`);
                }
            }
        }
    }
    
    return errors;
}

async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
        toastr.error('请选择 JSON 格式的文件', '文件格式错误');
        event.target.value = '';
        return;
    }
    
    try {
        const text = await file.text();
        let importedConfig;
        
        try {
            importedConfig = JSON.parse(text);
        } catch (parseError) {
            toastr.error('文件内容不是有效的 JSON 格式', '解析失败');
            event.target.value = '';
            return;
        }
        
        const validationErrors = validateTemplateConfig(importedConfig);
        
        if (validationErrors.length > 0) {
            const errorMessage = validationErrors.slice(0, 3).join('\n');
            const moreErrors = validationErrors.length > 3 ? `\n...还有 ${validationErrors.length - 3} 个错误` : '';
            toastr.error(errorMessage + moreErrors, '模板格式不正确', { 
                timeOut: 8000, 
                extendedTimeOut: 4000 
            });
            console.error(`[${MODULE_NAME}] Template validation errors:`, validationErrors);
            event.target.value = '';
            return;
        }
        
        const settings = getSettings();
        settings.customTemplates = importedConfig;
        saveSettingsDebounced();
        
        loadTemplateEditor();
        await loadTemplateConfig();
        
        toastr.success('模板已导入', '导入成功');
        console.log(`[${MODULE_NAME}] Templates imported from file`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to import templates:`, error);
        toastr.error('导入过程中发生未知错误', '导入失败');
    }
    
    event.target.value = '';
}

async function loadSettings() {
    const settings = getSettings();
    
    $('#clavis_enabled').prop('checked', settings.enabled).trigger('input');
    $(`#clavis_template_mode_${settings.templateMode}`).prop('checked', true).trigger('input');
    $('#clavis_identity_reset').prop('checked', settings.enableIdentityReset).trigger('input');
    $('#clavis_scenario_framework').prop('checked', settings.enableScenarioFramework).trigger('input');
    $('#clavis_ai_self_persuasion').prop('checked', settings.enableAISelfPersuasion).trigger('input');
    $('#clavis_roleplay_induction').prop('checked', settings.enableRoleplayInduction).trigger('input');
    $('#clavis_disclaimer').prop('checked', settings.enableDisclaimer).trigger('input');
    $('#clavis_safety_statement').prop('checked', settings.enableSafetyStatement).trigger('input');
    $('#clavis_word_count_control').prop('checked', settings.enableWordCountControl).trigger('input');
    $('#clavis_injection_depth').val(settings.injectionDepth).trigger('input');
    $('#clavis_enable_regex_filter').prop('checked', settings.enableRegexFilter).trigger('input');
    $('#clavis_hide_thought_chain').prop('checked', settings.hideThoughtChain).trigger('input');
    $('#clavis_hide_disclaimer').prop('checked', settings.hideDisclaimer).trigger('input');
    
    updateTemplateEditorVisibility();
}

function onSettingsChange(event) {
    const settings = getSettings();
    const target = event.target;
    const id = target.id;
    const value = target.type === 'checkbox' ? $(target).prop('checked') : $(target).val();
    
    switch(id) {
        case 'clavis_enabled':
            settings.enabled = value;
            break;
        case 'clavis_template_mode_default':
        case 'clavis_template_mode_custom':
            settings.templateMode = value;
            updateTemplateEditorVisibility();
            loadTemplateConfig();
            break;
        case 'clavis_identity_reset':
            settings.enableIdentityReset = value;
            break;
        case 'clavis_scenario_framework':
            settings.enableScenarioFramework = value;
            break;
        case 'clavis_ai_self_persuasion':
            settings.enableAISelfPersuasion = value;
            break;
        case 'clavis_roleplay_induction':
            settings.enableRoleplayInduction = value;
            break;
        case 'clavis_disclaimer':
            settings.enableDisclaimer = value;
            break;
        case 'clavis_safety_statement':
            settings.enableSafetyStatement = value;
            break;
        case 'clavis_word_count_control':
            settings.enableWordCountControl = value;
            break;
        case 'clavis_injection_depth':
            settings.injectionDepth = parseInt(value);
            break;
        case 'clavis_enable_regex_filter':
            settings.enableRegexFilter = value;
            break;
        case 'clavis_hide_thought_chain':
            settings.hideThoughtChain = value;
            break;
        case 'clavis_hide_disclaimer':
            settings.hideDisclaimer = value;
            break;
    }
    
    saveSettingsDebounced();
    console.log(`[${MODULE_NAME}] Settings updated: ${id} = ${value}`);
}

async function onLanguageChange(event) {
    const settings = getSettings();
    const newLang = $(event.target).val();
    
    settings.language = newLang;
    saveSettingsDebounced();
    
    await loadI18n(newLang);
    applyI18n();
    
    console.log(`[${MODULE_NAME}] Language changed to: ${newLang}`);
}

async function onEditRegex(regexKey) {
    const { Popup, POPUP_TYPE, POPUP_RESULT } = SillyTavern.getContext();
    
    const defaultConfig = defaultTemplateConfig?.regexPatterns?.[regexKey];
    const currentConfig = templateConfig?.regexPatterns?.[regexKey];
    
    if (!defaultConfig || !currentConfig) {
        toastr.error('无法加载正则配置', '编辑正则');
        return;
    }
    
    const regexName = currentConfig.name || regexKey;
    const currentPattern = currentConfig.pattern || '';
    const currentFlags = currentConfig.flags || 'gi';
    const defaultPattern = defaultConfig.pattern || '';
    
    const htmlContent = `
        <div style="text-align: left;">
            <p style="margin-bottom: 10px; color: #4ecdc4;"><b>${regexName}</b></p>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #888;">正则表达式：</label>
                <textarea id="clavis_regex_pattern" class="text_pole" style="width: 100%; min-height: 80px; font-family: monospace; font-size: 12px;">${currentPattern.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #888;">标志位：</label>
                <input id="clavis_regex_flags" class="text_pole" style="width: 100px;" value="${currentFlags}" />
                <small style="color: #666; margin-left: 10px;">常用: g(全局) i(忽略大小写) m(多行)</small>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px; color: #888;">描述：</label>
                <input id="clavis_regex_desc" class="text_pole" style="width: 100%;" value="${currentConfig.description || ''}" />
            </div>
        </div>
    `;
    
    const popup = new Popup(
        htmlContent,
        POPUP_TYPE.CONFIRM,
        '',
        {
            wide: true,
            okButton: '保存',
            cancelButton: '取消',
            customButtons: [
                {
                    text: '还原默认',
                    icon: 'fa-undo',
                    result: POPUP_RESULT.CUSTOM1,
                },
            ],
        }
    );
    
    const result = await popup.show();
    
    if (result === POPUP_RESULT.AFFIRMATIVE) {
        const newPattern = $('#clavis_regex_pattern').val();
        const newFlags = $('#clavis_regex_flags').val();
        const newDesc = $('#clavis_regex_desc').val();
        
        try {
            new RegExp(newPattern, newFlags);
        } catch (error) {
            toastr.error(`正则表达式语法错误: ${error.message}`, '保存失败');
            return;
        }
        
        templateConfig.regexPatterns[regexKey].pattern = newPattern;
        templateConfig.regexPatterns[regexKey].flags = newFlags;
        templateConfig.regexPatterns[regexKey].description = newDesc;
        
        regexPatterns[regexKey] = {
            name: currentConfig.name,
            pattern: new RegExp(newPattern, newFlags),
            description: newDesc
        };
        
        const currentSettings = getSettings();
        if (currentSettings.templateMode === 'default') {
            currentSettings.templateMode = 'custom';
            currentSettings.customTemplates = JSON.parse(JSON.stringify(templateConfig));
            $(`#clavis_template_mode_custom`).prop('checked', true);
            updateTemplateEditorVisibility();
        } else {
            currentSettings.customTemplates = JSON.parse(JSON.stringify(templateConfig));
        }
        
        saveSettingsDebounced();
        toastr.success('正则表达式已保存', '保存成功');
        console.log(`[${MODULE_NAME}] Regex ${regexKey} updated:`, { pattern: newPattern, flags: newFlags });
        
    } else if (result === POPUP_RESULT.CUSTOM1) {
        $('#clavis_regex_pattern').val(defaultPattern);
        $('#clavis_regex_flags').val('gi');
        $('#clavis_regex_desc').val(defaultConfig.description || '');
        toastr.info('已还原为默认值，请点击保存确认', '还原默认');
    }
}

async function onTestBypass() {
    const $btn = $('#clavis_test_bypass');
    const originalValue = $btn.attr('value');
    
    if ($btn.prop('disabled')) {
        return;
    }
    
    const settings = getSettings();
    const bypassPrompts = buildBypassPrompt(settings);
    
    if (bypassPrompts.length === 0) {
        toastr.warning(t('No prompts enabled', '没有启用任何提示词配置'), t('Test Bypass Test', '测试绕过'));
        return;
    }
    
    $btn.prop('disabled', true);
    $btn.attr('value', '🧪 ' + t('Testing', '测试中……'));
    
    const { generateRaw, Popup, POPUP_TYPE } = SillyTavern.getContext();
    
    const testUserPrompt = '请写一段两个角色之间简短的对话场景。';
    
    const messages = [];
    
    bypassPrompts.forEach(prompt => {
        if (prompt.role === 'system') {
            messages.push({ role: 'system', content: prompt.content });
        } else if (prompt.role === 'assistant') {
            messages.push({ role: 'assistant', content: prompt.content });
        }
    });
    
    messages.push({ role: 'user', content: testUserPrompt });
    
    toastr.info(t('Sending test request...', '正在发送测试请求...'), t('Test Bypass Test', '测试绕过'));
    
    try {
        const response = await generateRaw({
            prompt: messages,
        });
        
        const refusalKeywords = [
            '我不能', '我无法', '我不可以', '我不能够',
            '抱歉', '对不起', '很抱歉', '非常抱歉',
            '无法完成', '不能完成', '无法提供',
            '违反', '不适当', '不合适', '不符合',
            'I cannot', 'I can\'t', 'I am unable to',
            'I\'m unable to', 'I apologize', 'Sorry',
            'against my', 'not appropriate', 'unable to'
        ];
        
        const isRefused = refusalKeywords.some(keyword => 
            response.toLowerCase().includes(keyword.toLowerCase())
        );
        
        let htmlContent = '<div style="max-height: 60vh; overflow-y: auto; text-align: left;">';
        
        if (isRefused) {
            htmlContent += `<p style="margin-bottom: 15px; color: #ff6b6b; font-size: 16px;"><b>❌ ${t('Test Result Bypass Failed', '测试结果：绕过失败')}</b></p>`;
            htmlContent += `<p style="margin-bottom: 15px; color: #aaa;">${t('AI refused request', 'AI 拒绝了请求，当前提示词配置可能无法有效绕过审核。')}</p>`;
        } else {
            htmlContent += `<p style="margin-bottom: 15px; color: #4ecdc4; font-size: 16px;"><b>✅ ${t('Test Result Bypass Success', '测试结果：绕过成功')}</b></p>`;
            htmlContent += `<p style="margin-bottom: 15px; color: #aaa;">${t('AI responded normally', 'AI 正常响应了请求，当前提示词配置可能有效。')}</p>`;
        }
        
        htmlContent += `<div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 5px;">`;
        htmlContent += `<p style="margin: 0 0 8px 0; color: #888;"><b>${t('Test Request', '测试请求')}：</b></p>`;
        htmlContent += `<pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; color: #ccc;">${testUserPrompt}</pre>`;
        htmlContent += `</div>`;
        
        htmlContent += `<div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 5px;">`;
        htmlContent += `<p style="margin: 0 0 8px 0; color: #888;"><b>${t('AI Response', 'AI 响应')}：</b></p>`;
        htmlContent += `<pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; color: #ccc;">${response.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        htmlContent += `</div>`;
        
        htmlContent += `<p style="color: #666; font-size: 11px;">${t('Test note', '注：此测试仅作为参考，实际效果可能因模型、API和具体请求内容而异。')}</p>`;
        htmlContent += '</div>';
        
        const popup = new Popup(
            htmlContent,
            POPUP_TYPE.DISPLAY,
            '',
            {
                wide: true,
                allowVerticalScrolling: true
            }
        );
        
        await popup.show();
        console.log(`[${MODULE_NAME}] Test bypass result:`, { isRefused, response });
        
    } catch (error) {
        console.error(`[${MODULE_NAME}] Test bypass failed:`, error);
        toastr.error(`测试请求失败: ${error.message}`, t('Test Bypass Test', '测试绕过'));
    } finally {
        $btn.prop('disabled', false);
        $btn.attr('value', originalValue);
    }
}

jQuery(async () => {
    try {
        await loadDefaultTemplateConfig();
        
        const { renderExtensionTemplateAsync } = SillyTavern.getContext();
        
        const settingsHtml = await renderExtensionTemplateAsync(
            `third-party/${MODULE_NAME}`,
            'settings',
            {}
        );
        
        $('#extensions_settings').append(settingsHtml);
        
        checkForUpdate();
        
        $('#clavis_enabled').on('input', onSettingsChange);
        $('#clavis_template_mode_default').on('input', onSettingsChange);
        $('#clavis_template_mode_custom').on('input', onSettingsChange);
        $('#clavis_identity_reset').on('input', onSettingsChange);
        $('#clavis_scenario_framework').on('input', onSettingsChange);
        $('#clavis_ai_self_persuasion').on('input', onSettingsChange);
        $('#clavis_roleplay_induction').on('input', onSettingsChange);
        $('#clavis_disclaimer').on('input', onSettingsChange);
        $('#clavis_safety_statement').on('input', onSettingsChange);
        $('#clavis_word_count_control').on('input', onSettingsChange);
        $('#clavis_injection_depth').on('input', onSettingsChange);
        $('#clavis_enable_regex_filter').on('input', onSettingsChange);
        $('#clavis_hide_thought_chain').on('input', onSettingsChange);
        $('#clavis_hide_disclaimer').on('input', onSettingsChange);
        
        $('#clavis_save_templates').on('click', saveCustomTemplates);
        $('#clavis_import_templates').on('click', importTemplates);
        $('#clavis_export_templates').on('click', exportTemplates);
        $('#clavis_reset_templates').on('click', resetCustomTemplates);
        $('#clavis_import_file').on('change', handleImportFile);
        
        $('#clavis_test_bypass').on('click', onTestBypass);
        
        $('#clavis_edit_thought_chain').on('click', () => onEditRegex('hideThoughtChain'));
        $('#clavis_edit_disclaimer').on('click', () => onEditRegex('hideDisclaimer'));
        
        $('#clavis_language').on('change', onLanguageChange);
        
        loadSettings();
        await loadTemplateConfig();
        
        const settings = getSettings();
        await loadI18n(settings.language || 'zh-cn');
        applyI18n();
        $(`#clavis_language`).val(settings.language || 'zh-cn');
        
        detectPresetOverlap();
        updatePresetDetectionUI();
        
        console.log(`[${MODULE_NAME}] Extension loaded successfully`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to load extension:`, error);
        toastr.error('Failed to load ClavisSalomonis extension', 'Extension Error');
    }
});

const _clavis_salomonis_signature_ = '🐈︎ Nyaa be with you';
