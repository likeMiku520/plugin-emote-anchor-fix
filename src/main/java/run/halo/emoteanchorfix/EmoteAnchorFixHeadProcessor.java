package run.halo.emoteanchorfix;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.PropertyPlaceholderHelper;
import org.thymeleaf.context.ITemplateContext;
import org.thymeleaf.model.IModel;
import org.thymeleaf.model.IModelFactory;
import org.thymeleaf.processor.element.IElementModelStructureHandler;
import reactor.core.publisher.Mono;
import run.halo.app.plugin.PluginContext;
import run.halo.app.theme.dialect.TemplateHeadProcessor;

/**
 * Injects the front-end fix into every rendered page.
 *
 * <p>The comment widget repositions its emote panel with viewport coordinates once the
 * panel switches to {@code position: fixed}. A theme that leaves a non-{@code none}
 * transform on an ancestor of the widget turns that ancestor into the containing block,
 * so the panel is painted far away from the button. The script corrects the panel
 * placement after the widget opens it.
 *
 * <p>The script is inlined instead of being referenced from the plugin static directory,
 * so the page always carries it no matter how plugin assets are routed.
 */
@Component
public class EmoteAnchorFixHeadProcessor implements TemplateHeadProcessor {

    static final PropertyPlaceholderHelper PROPERTY_PLACEHOLDER_HELPER =
        new PropertyPlaceholderHelper("${", "}");

    private static final String SCRIPT_RESOURCE = "static/emote-anchor-fix.js";

    private final PluginContext pluginContext;

    private volatile String inlineScript;

    public EmoteAnchorFixHeadProcessor(PluginContext pluginContext) {
        this.pluginContext = pluginContext;
    }

    @Override
    public Mono<Void> process(ITemplateContext context, IModel model,
                              IElementModelStructureHandler structureHandler) {
        final String head = headContent();
        if (head == null || head.isBlank()) {
            return Mono.empty();
        }
        final IModelFactory modelFactory = context.getModelFactory();
        model.add(modelFactory.createText(head));
        return Mono.empty();
    }

    private String headContent() {
        final String body = scriptBody();
        if (body == null || body.isBlank()) {
            return externalScript();
        }
        return """
            <!-- plugin-emote-anchor-fix start -->
            <script data-emote-anchor-fix="inline">%s</script>
            <!-- plugin-emote-anchor-fix end -->
            """.formatted(body);
    }

    private String scriptBody() {
        String body = inlineScript;
        if (body != null) {
            return body;
        }
        final ClassPathResource resource =
            new ClassPathResource(SCRIPT_RESOURCE, getClass().getClassLoader());
        try (var input = resource.getInputStream()) {
            body = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            inlineScript = body;
            return body;
        } catch (IOException e) {
            return null;
        }
    }

    private String externalScript() {
        final Properties properties = new Properties();
        properties.setProperty("version", pluginContext.getVersion());
        return PROPERTY_PLACEHOLDER_HELPER.replacePlaceholders("""
            <!-- plugin-emote-anchor-fix start -->
            <script defer src="/plugins/plugin-emote-anchor-fix/assets/static/emote-anchor-fix.js?version=${version}"></script>
            <!-- plugin-emote-anchor-fix end -->
            """, properties);
    }
}